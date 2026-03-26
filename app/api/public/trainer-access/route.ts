import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createTrainerAccount, findTrainerByEmail, updateTrainerAccountPin, verifyTrainerEmail } from "@/lib/trainerDb"
import { findMemberByEmail } from "@/lib/boxgymDb"
import { getAppBaseUrl } from "@/lib/mailConfig"
import { isValidPin, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { sendVerificationEmail } from "@/lib/resendClient"
import { verifyTrainerPinHash } from "@/lib/trainerPin"

type TrainerAccessBody =
  | {
      action: "register"
      firstName?: string
      lastName?: string
      email?: string
      phone?: string
      pin?: string
    }
  | {
      action: "verify_email"
      token?: string
    }
  | {
      action: "update_pin"
      email?: string
      currentPin?: string
      newPin?: string
    }

const TRAINER_VERIFY_PARAM = "trainer_verify"

function generateEmailVerificationToken() {
  return randomUUID()
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const rateLimit = checkRateLimit(`public-trainer-access:${getRequestIp(request)}`, 12, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as TrainerAccessBody

    if (body.action === "verify_email") {
      const token = body.token?.trim() ?? ""
      if (!token) {
        return new NextResponse("Trainer-Bestaetigungslink ungueltig oder bereits verwendet.", { status: 400 })
      }

      const data = await verifyTrainerEmail(token)
      if (!data) {
        return new NextResponse("Trainer-Bestaetigungslink ungueltig oder bereits verwendet.", { status: 404 })
      }

      return NextResponse.json({ ok: true, email: data.email })
    }

    if (body.action === "register") {
      const firstName = body.firstName?.trim() ?? ""
      const lastName = body.lastName?.trim() ?? ""
      const email = body.email?.trim().toLowerCase() ?? ""
      const phone = body.phone?.trim() ?? ""
      const pin = body.pin?.trim() ?? ""

      if (!firstName || !lastName || !email || !pin) {
        return new NextResponse("Bitte alle Felder fuer die Trainerregistrierung ausfuellen.", { status: 400 })
      }

      if (!isValidPin(pin)) {
        return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      const existingTrainer = await findTrainerByEmail(email)
      if (existingTrainer) {
        if (existingTrainer.is_approved) {
          return new NextResponse("Fuer diese E-Mail existiert bereits ein freigegebenes Trainerkonto.", { status: 409 })
        }
        if (existingTrainer.email_verified) {
          return new NextResponse("Dieses Trainerkonto ist bereits bestaetigt und wartet nur noch auf die Admin-Freigabe.", { status: 409 })
        }
        return new NextResponse("Fuer diese E-Mail existiert bereits eine offene Trainerregistrierung.", { status: 409 })
      }

      const linkedMember = await findMemberByEmail(email)
      const verificationToken = generateEmailVerificationToken()
      const verificationBaseUrl = getAppBaseUrl()
      const verificationLink = `${verificationBaseUrl}/trainer-zugang?${TRAINER_VERIFY_PARAM}=${verificationToken}`

      await createTrainerAccount({
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        pin,
        email_verification_token: verificationToken,
        linked_member_id: linkedMember?.id ?? null,
      })

      await sendVerificationEmail({
        email,
        name: `${firstName} ${lastName}`.trim(),
        link: verificationLink,
        kind: "trainer",
      })

      return NextResponse.json({ ok: true, email })
    }

    if (body.action === "update_pin") {
      const email = body.email?.trim().toLowerCase() ?? ""
      const currentPin = body.currentPin?.trim() ?? ""
      const newPin = body.newPin?.trim() ?? ""

      if (!email || !currentPin || !newPin) {
        return new NextResponse("Bitte E-Mail, aktuellen PIN und neuen PIN angeben.", { status: 400 })
      }

      if (!isValidPin(newPin)) {
        return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      const trainer = await findTrainerByEmail(email)
      if (!trainer || !trainer.email_verified || !trainer.is_approved) {
        return new NextResponse("Zugangsdaten nicht korrekt oder noch nicht freigegeben.", { status: 401 })
      }

      const isCurrentPinValid = await verifyTrainerPinHash(currentPin, trainer.password_hash)
      if (!isCurrentPinValid) {
        return new NextResponse("Zugangsdaten nicht korrekt oder noch nicht freigegeben.", { status: 401 })
      }

      await updateTrainerAccountPin(trainer.id, newPin)

      return NextResponse.json({ ok: true, email })
    }

    return new NextResponse("Invalid action", { status: 400 })
  } catch (error) {
    console.error("public trainer access failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
