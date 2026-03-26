import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createTrainerAccount, type TrainerLicense } from "@/lib/trainerDb"
import { findMemberByEmail } from "@/lib/boxgymDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { isValidPin, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { sendVerificationEmail } from "@/lib/resendClient"

type AdminTrainerAccountBody = {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  trainerLicense?: TrainerLicense
  pin?: string
  linkedMemberId?: string
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = checkRateLimit(`admin-trainer-account:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as AdminTrainerAccountBody
    const firstName = body.firstName?.trim() ?? ""
    const lastName = body.lastName?.trim() ?? ""
    const email = body.email?.trim().toLowerCase() ?? ""
    const phone = body.phone?.trim() ?? ""
    const trainerLicense = body.trainerLicense
    const pin = body.pin?.trim() ?? ""
    const linkedMemberId = body.linkedMemberId?.trim() || null

    if (!firstName || !lastName || !email || !pin) {
      return new NextResponse("Bitte alle Felder fuer das Trainerkonto ausfuellen.", { status: 400 })
    }

    if (!isValidPin(pin)) {
      return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
    }

    const verificationToken = randomUUID()
    const linkedMember = linkedMemberId ? null : await findMemberByEmail(email)

    await createTrainerAccount({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      trainer_license: trainerLicense,
      pin,
      email_verification_token: verificationToken,
      linked_member_id: linkedMemberId ?? linkedMember?.id ?? null,
    })

    const verificationBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
    const verificationLink = `${verificationBaseUrl}/trainer-zugang?trainer_verify=${verificationToken}`

    await sendVerificationEmail({
      email,
      name: `${firstName} ${lastName}`.trim(),
      link: verificationLink,
      kind: "trainer",
    })

    return NextResponse.json({ ok: true, email })
  } catch (error) {
    console.error("admin trainer account creation failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
