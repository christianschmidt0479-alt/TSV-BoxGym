import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createMember, findMemberByFirstLastAndBirthdate, updateMemberRegistrationData } from "@/lib/boxgymDb"
import { enqueueAdminNotification } from "@/lib/adminDigestDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { linkParentAccountToMember, upsertParentAccount } from "@/lib/parentAccountsDb"
import { sendVerificationEmail } from "@/lib/resendClient"

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

const MEMBER_SECRET_REGEX = /^[A-Za-z0-9]{8,16}$/

function generateEmailVerificationToken() {
  return randomUUID()
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const rateLimit = checkRateLimit(`public-member-register:${getRequestIp(request)}`, 12, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as MemberRegisterBody
    const firstName = body.firstName?.trim() ?? ""
    const lastName = body.lastName?.trim() ?? ""
    const birthDate = body.birthDate ?? ""
    const gender = body.gender?.trim() ?? ""
    const pin = body.pin?.trim() ?? ""
    const email = body.email?.trim() ?? ""
    const phone = body.phone?.trim() ?? ""
    const guardianName = body.guardianName?.trim() ?? ""
    const parentAccessCodeHash = body.parentAccessCodeHash?.trim() ?? ""
    const baseGroup = body.baseGroup?.trim() ?? ""
    const isBoxzwergeRegistration = baseGroup === "Boxzwerge"

    if (!firstName || !lastName) {
      return new NextResponse("Bitte Vorname und Nachname eingeben.", { status: 400 })
    }

    if (!birthDate) {
      return new NextResponse("Bitte Geburtsdatum angeben.", { status: 400 })
    }

    if (!isBoxzwergeRegistration && !MEMBER_SECRET_REGEX.test(pin)) {
      return new NextResponse("Der Zugangscode muss 8 bis 16 Zeichen lang sein und darf nur Buchstaben und Zahlen enthalten.", { status: 400 })
    }

    if (!email) {
      return new NextResponse(isBoxzwergeRegistration ? "Bitte Eltern-E-Mail angeben." : "Bitte E-Mail angeben.", { status: 400 })
    }

    if (!phone) {
      return new NextResponse(isBoxzwergeRegistration ? "Bitte Eltern-Telefonnummer angeben." : "Bitte Telefonnummer angeben.", { status: 400 })
    }

    if (!baseGroup) {
      return new NextResponse("Bitte Stammgruppe auswaehlen.", { status: 400 })
    }

    if (isBoxzwergeRegistration && !guardianName) {
      return new NextResponse("Bitte einen Elternteil oder Notfallkontakt angeben.", { status: 400 })
    }

    if (isBoxzwergeRegistration && !parentAccessCodeHash) {
      return new NextResponse("Bitte einen Eltern-Zugangscode angeben.", { status: 400 })
    }

    const emailToken = generateEmailVerificationToken()
    const existing = await findMemberByFirstLastAndBirthdate(firstName, lastName, birthDate)

    const member = existing
      ? await updateMemberRegistrationData(existing.id, {
          member_pin: isBoxzwergeRegistration ? null : pin,
          gender: gender || null,
          email,
          phone,
          guardian_name: guardianName || null,
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
          member_pin: isBoxzwergeRegistration ? undefined : pin,
          is_approved: false,
          base_group: baseGroup,
        })

    const updatedMember =
      existing
        ? member
        : await updateMemberRegistrationData(member.id, {
            gender: gender || null,
            email_verified: false,
            email_verified_at: null,
            email_verification_token: emailToken,
            base_group: baseGroup,
          })

    if (isBoxzwergeRegistration) {
      const parentAccount = await upsertParentAccount({
        parent_name: guardianName,
        email,
        phone,
        access_code_hash: parentAccessCodeHash,
      })

      await linkParentAccountToMember(parentAccount.id, updatedMember.id)
    }

    const verificationBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
    const verificationLink = `${verificationBaseUrl}/mein-bereich?verify=${emailToken}`

    let verificationSent = true

    try {
      await sendVerificationEmail({
        email,
        name: `${firstName} ${lastName}`.trim(),
        link: verificationLink,
        kind: isBoxzwergeRegistration ? "boxzwerge" : "member",
      })
    } catch (error) {
      verificationSent = false
      console.error("member verification mail failed", error)
    }

    try {
      await enqueueAdminNotification({
        kind: isBoxzwergeRegistration ? "boxzwerge" : "member",
        memberName: `${firstName} ${lastName}`.trim(),
        email,
        group: baseGroup,
      })
    } catch (error) {
      console.error("member admin notification failed", error)
    }

    return NextResponse.json({ ok: true, verificationSent })
  } catch (error) {
    console.error("public member register failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
