// Hilfsfunktion zum Maskieren von E-Mails (c***@e***.de)
function maskEmail(email: string): string {
  const [user, domain] = email.split("@")
  if (!user || !domain) return "***"
  const userMasked = user.length > 1 ? user[0] + "***" : "*"
  const domainParts = domain.split(".")
  const domainMasked = domainParts[0].length > 1 ? domainParts[0][0] + "***" : "*"
  const tld = domainParts.slice(1).join(".")
  return `${userMasked}@${domainMasked}${tld ? "." + tld : ""}`
}
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
      // Kein Zugriff auf body möglich, daher ohne E-Mail loggen
      console.warn('[member-flow][register][error] reason=forbidden')
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
    const rateLimit = await checkRateLimitAsync(
      `public-member-register:${getRequestIp(request)}:${email.toLowerCase() || "__email__"}`,
      12,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    if (!firstName || !lastName) {
      console.warn('[member-flow][register][error] reason=missing_name email=' + maskEmail(email))
      return new NextResponse("Bitte Vorname und Nachname eingeben.", { status: 400 })
    }

    if (!birthDate) {
      console.warn('[member-flow][register][error] reason=invalid_birthdate email=' + maskEmail(email))
      return new NextResponse("Bitte ein gültiges Geburtsdatum angeben.", { status: 400 })
    }

    if (!baseGroup) {
      console.warn('[member-flow][register][error] reason=missing_basegroup email=' + maskEmail(email))
      return new NextResponse("Bitte Stammgruppe auswählen.", { status: 400 })
    }

    if (!gender) {
      console.warn('[member-flow][register][error] reason=missing_gender email=' + maskEmail(email))
      return new NextResponse("Bitte Geschlecht angeben.", { status: 400 })
    }

    if (!isValidMemberPassword(password)) {
      console.warn('[member-flow][register][error] reason=invalid_password email=' + maskEmail(email))
      return new NextResponse(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, { status: 400 })
    }

    if (!email) {
      console.warn('[member-flow][register][error] reason=missing_email')
      return new NextResponse("Bitte E-Mail angeben.", { status: 400 })
    }

    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      return new NextResponse(emailValidation.error || "Bitte eine gültige E-Mail-Adresse angeben.", { status: 400 })
    }

    if (!phone) {
      console.warn('[member-flow][register][error] reason=missing_phone email=' + maskEmail(email))
      return new NextResponse("Telefonnummer ist erforderlich.", { status: 400 })
    }

    if (!consent) {
      console.warn('[member-flow][register][error] reason=missing_consent email=' + maskEmail(email))
      return new NextResponse("Bitte Datenschutz akzeptieren", { status: 400 })
    }


    // --- NEU: Ziel-Datensatz nach klarer Regel bestimmen ---
    const supabase = createServerSupabaseServiceClient()
    // 1. Alle Members mit dieser E-Mail laden (absteigend nach created_at)
    const { data: allByEmail, error: emailErr } = await supabase
      .from("members")
      .select("*")
      .eq("email", email)
      .order("created_at", { ascending: false })
    if (emailErr) {
      console.error('[member-flow][register][error] reason=email_lookup_failed email=' + maskEmail(email))
      throw emailErr
    }

    // 2. Zielregel: Jüngster unverifizierter, nicht freigegebener Datensatz
    let target = allByEmail?.find(m => !m.email_verified && !m.is_approved) ?? null
    // 3. Sonst: Jüngster Datensatz mit passender E-Mail
    if (!target && allByEmail && allByEmail.length > 0) target = allByEmail[0]

    // 4. Wenn kein Datensatz existiert: nach Name/Geburtsdatum suchen
    let existing = target
    if (!existing) {
      existing = await findMemberByFirstLastAndBirthdate(firstName, lastName, birthDate)
    }

    // 5. Wenn immer noch kein Datensatz: neu anlegen
    let member
    let emailToken
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString()
    if (existing) {
      // Neues Token generieren
      emailToken = generateEmailVerificationToken()
      // Registrierungsdaten auf Ziel-Datensatz schreiben
      member = await updateMemberRegistrationData(existing.id, {
        first_name: firstName,
        last_name: lastName,
        birthdate: birthDate,
        member_pin: password,
        gender: gender || null,
        email,
        phone,
        guardian_name: guardianName || null,
        privacy_accepted_at: new Date().toISOString(),
        email_verified: false,
        email_verified_at: null,
        email_verification_token: emailToken,
        email_verification_expires_at: expiresAt,
        base_group: baseGroup,
      })

      // Konkurrierende Tokens neutralisieren
      if (allByEmail) {
        for (const m of allByEmail) {
          if (m.id !== existing.id && m.email_verification_token) {
            await supabase
              .from("members")
              .update({ email_verification_token: null, email_verification_expires_at: null })
              .eq("id", m.id)
          }
        }
      }
    } else {
      emailToken = generateEmailVerificationToken()
      member = await createMember({
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
        email_verification_token: emailToken,
        email_verification_expires_at: expiresAt,
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
      console.error('[member-flow][register][error] reason=verification_mail_failed email=' + maskEmail(email), error)
    }

    try {
      await enqueueAdminNotification({
        kind: "member",
        memberName: `${firstName} ${lastName}`.trim(),
        email,
        group: baseGroup,
      })
    } catch (error) {
      console.error('[member-flow][register][error] reason=admin_notification_failed email=' + maskEmail(email), error)
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

    console.info('[member-flow][register][success] id=' + member.id + ' email=' + maskEmail(email))
    return NextResponse.json({ ok: true, verificationSent })
  } catch (error: any) {
    // Versuche, E-Mail zu maskieren, falls im Body vorhanden
    let masked = ''
    try {
      const req = error?.body || error?.requestBody || ''
      if (typeof req === 'string' && req.includes('@')) masked = ' email=' + maskEmail(req)
    } catch {}
    console.error('[member-flow][register][error] reason=exception' + masked, error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
