import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createMember, findMemberByFirstLastAndBirthdate, updateMemberRegistrationData } from "@/lib/boxgymDb"
import { enqueueAdminNotification } from "@/lib/adminDigestDb"
import { ensureMemberAuthUserLink } from "@/lib/memberAuthLink"
import { isValidMemberPassword, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/memberPassword"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { validateEmail } from "@/lib/formValidation"
import { sendVerificationEmail } from "@/lib/resendClient"
import { parseTrainingGroup } from "@/lib/trainingGroups"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { matchMemberAgainstExcelRows } from "@/lib/officeMatch"

type MemberRegisterBody = {
  firstName?: string
  lastName?: string
  birthDate?: string
  gender?: string
  password?: string
  pin?: string
  email?: string
  phone?: string
  guardianName?: string
  parentAccessCodeHash?: string
  baseGroup?: string
  consent?: boolean
}

function normalizeBirthDateInput(value?: string | null) {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return ""

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!isoMatch) return ""

  const [, year, month, day] = isoMatch
  const date = new Date(`${year}-${month}-${day}T12:00:00`)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return ""
  }

  return `${year}-${month}-${day}`
}

function generateEmailVerificationToken() {
  return randomUUID()
}

function hasExistingMemberAccess(record: Record<string, unknown>) {
  const email = typeof record.email === "string" ? record.email.trim() : ""
  const memberPin = typeof record.member_pin === "string" ? record.member_pin.trim() : ""
  return Boolean(email || memberPin || record.email_verified || record.email_verified_at)
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as MemberRegisterBody
    const firstName = body.firstName?.trim() ?? ""
    const lastName = body.lastName?.trim() ?? ""
    const birthDate = normalizeBirthDateInput(body.birthDate)
    const gender = body.gender?.trim() ?? ""
    const password = body.password?.trim() ?? body.pin?.trim() ?? ""
    const email = body.email?.trim() ?? ""
    const phone = body.phone?.trim() ?? ""
    const guardianName = body.guardianName?.trim() ?? ""
    const baseGroup = parseTrainingGroup(body.baseGroup)
    const consent = body.consent === true

    // Basisvalidierung vor Rate-Limit
    if (!firstName || !lastName) {
      return new NextResponse("Bitte Vorname und Nachname eingeben.", { status: 400 })
    }

    if (!birthDate) {
      return new NextResponse("Bitte ein gültiges Geburtsdatum angeben.", { status: 400 })
    }

    if (!baseGroup) {
      return new NextResponse("Bitte Stammgruppe auswählen.", { status: 400 })
    }

    if (!gender) {
      return new NextResponse("Bitte Geschlecht angeben.", { status: 400 })
    }

    if (!isValidMemberPassword(password)) {
      return new NextResponse(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, { status: 400 })
    }

    if (!email) {
      return new NextResponse("Bitte E-Mail angeben.", { status: 400 })
    }

    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      return new NextResponse(emailValidation.error || "Bitte eine gültige E-Mail-Adresse angeben.", { status: 400 })
    }

    if (!phone) {
      return new NextResponse("Telefonnummer ist erforderlich.", { status: 400 })
    }

    if (!consent) {
      return new NextResponse("Bitte Datenschutz akzeptieren", { status: 400 })
    }

    // Rate-Limit nur anwenden, wenn E-Mail und echte IP vorhanden
    const ip = getRequestIp(request)
    const emailKey = email.toLowerCase()
    if (ip && ip !== "unknown" && emailKey) {
      const rateLimitKey = `public-member-register:${ip}:${emailKey}`
      const rateLimit = await checkRateLimitAsync(
        rateLimitKey,
        20,
        10 * 60 * 1000
      )
      // Optionales Logging für Debug
      console.log("[member-register] RateLimit", { key: rateLimitKey, ip, email: emailKey, ok: rateLimit.ok })
      if (!rateLimit.ok) {
        return new NextResponse("Too many requests", { status: 429 })
      }
    } else {
      // Kein Rate-Limit bei fehlender E-Mail oder IP
      console.log("[member-register] RateLimit skipped", { ip, email: emailKey })
    }

    const emailToken = generateEmailVerificationToken()
    const existing = await findMemberByFirstLastAndBirthdate(firstName, lastName, birthDate)

    if (existing && hasExistingMemberAccess(existing as Record<string, unknown>)) {
      return new NextResponse(
        "Zu diesem Mitglied existiert bereits ein Zugang. Bitte Mein Bereich nutzen oder Trainer/Admin ansprechen.",
        { status: 409 }
      )
    }

    const member = existing
      ? await updateMemberRegistrationData(existing.id, {
          member_pin: password,
          gender: gender || null,
          email,
          phone,
          guardian_name: guardianName || null,
          privacy_accepted_at: new Date().toISOString(),
          email_verified: false,
          email_verified_at: null,
          email_verification_token: emailToken,
          base_group: baseGroup,
        })
      : await createMember({
          first_name: firstName,
          last_name: lastName,
          birthdate: birthDate,
          gender: gender || undefined,
          email,
          phone,
          guardian_name: guardianName || undefined,
          is_trial: false,
          member_pin: password,
          is_approved: false,
          base_group: baseGroup,
        })

    if (!existing) {
      await updateMemberRegistrationData(member.id, {
        gender: gender || null,
        privacy_accepted_at: new Date().toISOString(),
        email_verified: false,
        email_verified_at: null,
        email_verification_token: emailToken,
        base_group: baseGroup,
      })
    }

    await ensureMemberAuthUserLink({
      memberId: member.id,
      email,
      password,
      emailVerified: false,
    })

    const verificationBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
    const verificationLink = `${verificationBaseUrl}/mein-bereich?verify=${emailToken}`

    let verificationSent = true

    try {
      await sendVerificationEmail({
        email,
        name: `${firstName} ${lastName}`.trim(),
        link: verificationLink,
        kind: "member",
      })
    } catch (error) {
      verificationSent = false
      console.error("member verification mail failed", error)
    }

    try {
      await enqueueAdminNotification({
        kind: "member",
        memberName: `${firstName} ${lastName}`.trim(),
        email,
        group: baseGroup,
      })
    } catch (error) {
      console.error("member admin notification failed", error)
    }
    // Automatic Office/GS list match — non-blocking, does not affect registration flow
    try {
      const supabase = createServerSupabaseServiceClient()
      const runResponse = await supabase
        .from("office_reconciliation_runs")
        .select("rows")
        .eq("is_active", true)
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!runResponse.error && runResponse.data) {
        const storedRows = Array.isArray(runResponse.data.rows) ? (runResponse.data.rows as Array<Record<string, unknown>>) : []
        const excelRows = storedRows
          .filter((r) => r.excel === "Ja")
          .map((r) => ({
            firstName: String(r.firstName ?? ""),
            lastName: String(r.lastName ?? ""),
            birthdate: String(r.birthdate ?? ""),
            email: typeof r.email === "string" ? r.email : "",
            phone: typeof r.phone === "string" ? r.phone : "",
            groupExcel: String(r.groupExcel ?? ""),
          }))

        const matchResult = matchMemberAgainstExcelRows(
          { firstName, lastName, birthdate: birthDate, email, phone },
          excelRows,
        )

        await supabase
          .from("members")
          .update({
            office_list_status: matchResult ? matchResult.status : "red",
            office_list_group: matchResult?.group || null,
            office_list_checked_at: new Date().toISOString(),
          })
          .eq("id", member.id)
      }
    } catch (officeError) {
      console.warn("[member-register] office match failed (non-blocking)", officeError)
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("[member-register] success", { memberId: member.id, email, verificationSent })
    }
    return NextResponse.json({ ok: true, verificationSent })
  } catch (error) {
    console.error("[member-register] failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
