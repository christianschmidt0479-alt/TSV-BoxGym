import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createMember, findMemberByFirstLastAndBirthdate, updateMemberRegistrationData } from "@/lib/boxgymDb"
import { enqueueAdminNotification } from "@/lib/adminDigestDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { isValidPin, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { sendVerificationEmail } from "@/lib/resendClient"
import { parseTrainingGroup } from "@/lib/trainingGroups"

type MemberRegisterBody = {
  firstName?: string
  lastName?: string
  birthDate?: string
  gender?: string
  pin?: string
  email?: string
  phone?: string
  guardianName?: string
  parentAccessCodeHash?: string
  baseGroup?: string
}

function toLoggableError(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    return {
      message: typeof candidate.message === "string" ? candidate.message : String(candidate.message ?? ""),
      details: typeof candidate.details === "string" ? candidate.details : String(candidate.details ?? ""),
      hint: typeof candidate.hint === "string" ? candidate.hint : String(candidate.hint ?? ""),
      code: typeof candidate.code === "string" ? candidate.code : String(candidate.code ?? ""),
    }
  }

  return {
    message: String(error ?? ""),
    details: "",
    hint: "",
    code: "",
  }
}

function isMemberPinConstraintError(error: unknown) {
  const details = `${toLoggableError(error).message}\n${toLoggableError(error).details}`.toLowerCase()
  return details.includes("members_member_pin_format") || (details.includes("member_pin") && details.includes("violates check constraint"))
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
    const pin = body.pin?.trim() ?? ""
    const email = body.email?.trim() ?? ""
    const phone = body.phone?.trim() ?? ""
    const guardianName = body.guardianName?.trim() ?? ""
    const baseGroup = parseTrainingGroup(body.baseGroup)
    const rateLimit = await checkRateLimitAsync(
      `public-member-register:${getRequestIp(request)}:${email.toLowerCase() || "__email__"}`,
      12,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    if (!firstName || !lastName) {
      return new NextResponse("Bitte Vorname und Nachname eingeben.", { status: 400 })
    }

    if (!birthDate) {
      return new NextResponse("Bitte ein gueltiges Geburtsdatum angeben.", { status: 400 })
    }

    if (!baseGroup) {
      return new NextResponse("Bitte Stammgruppe auswaehlen.", { status: 400 })
    }

    if (!isValidPin(pin)) {
      return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
    }

    if (!email) {
      return new NextResponse("Bitte E-Mail angeben.", { status: 400 })
    }

    if (!phone) {
      return new NextResponse("Telefonnummer ist erforderlich.", { status: 400 })
    }

    console.info("member-register validated payload", {
      firstName,
      lastName,
      birthDate,
      gender,
      baseGroup,
      hasEmail: Boolean(email),
      hasPhone: Boolean(phone),
      hasGuardianName: Boolean(guardianName),
    })

    const emailToken = generateEmailVerificationToken()
    let existing = null

    try {
      existing = await findMemberByFirstLastAndBirthdate(firstName, lastName, birthDate)
      console.info("member-register findMemberByFirstLastAndBirthdate result", {
        found: Boolean(existing),
        memberId: existing?.id ?? null,
      })
    } catch (error) {
      console.error("member-register findMemberByFirstLastAndBirthdate failed", toLoggableError(error))
      throw error
    }

    let member

    if (existing) {
      member = await updateMemberRegistrationData(existing.id, {
        member_pin: pin,
        gender: gender || null,
        email,
        phone,
        guardian_name: guardianName || null,
        email_verified: false,
        email_verified_at: null,
        email_verification_token: emailToken,
        base_group: baseGroup,
      })
    } else {
      try {
        member = await createMember({
          first_name: firstName,
          last_name: lastName,
          birthdate: birthDate,
          gender: gender || undefined,
          email,
          phone,
          guardian_name: guardianName || undefined,
          is_trial: false,
          member_pin: pin,
          is_approved: false,
          base_group: baseGroup,
        })
        console.info("member-register createMember result", {
          memberId: member?.id ?? null,
        })
      } catch (error) {
        console.error("member-register createMember failed", toLoggableError(error))
        throw error
      }
    }

    if (!existing) {
      await updateMemberRegistrationData(member.id, {
        gender: gender || null,
        email_verified: false,
        email_verified_at: null,
        email_verification_token: emailToken,
        base_group: baseGroup,
      })
    }

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

    return NextResponse.json({ ok: true, verificationSent })
  } catch (error) {
    console.error("public member register failed", toLoggableError(error))
    if (isMemberPinConstraintError(error)) {
      return new NextResponse("Registrierung ist gerade serverseitig nicht vollständig freigeschaltet. Bitte kurz Bescheid geben.", { status: 500 })
    }
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
