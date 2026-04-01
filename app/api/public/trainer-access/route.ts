import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import {
  createTrainerAccount,
  findTrainerByEmail,
  isTrainerAccountEmailConflict,
  updateTrainerAccountPin,
  verifyTrainerEmail,
} from "@/lib/trainerDb"
import { findMemberByEmail } from "@/lib/boxgymDb"
import { validateEmail } from "@/lib/formValidation"
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
const DUPLICATE_EMAIL_MESSAGE = "Diese E-Mail-Adresse ist bereits vergeben."

function generateEmailVerificationToken() {
  return randomUUID()
}

function isMailDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes("resend") || message.includes("mail") || message.includes("email")
}

function logTrainerAccessFailure(step: string, error: unknown, context?: Record<string, unknown>) {
  console.error(`[public trainer access] ${step} failed`, context ?? {}, error)
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as TrainerAccessBody
    const normalizedEmail =
      body.action === "register" || body.action === "update_pin"
        ? body.email?.trim().toLowerCase() ?? ""
        : ""
    const rateLimit = await checkRateLimitAsync(
      `public-trainer-access:${getRequestIp(request)}:${body.action}:${normalizedEmail || "__subject__"}`,
      12,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

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
        console.warn("[public trainer access] validation failed", { step: "validation", email })
        return new NextResponse("Bitte alle Felder fuer die Trainerregistrierung ausfuellen.", { status: 400 })
      }

      const emailValidation = validateEmail(email)
      if (!emailValidation.valid) {
        console.warn("[public trainer access] validation failed", { step: "validation", email })
        return new NextResponse(emailValidation.error || "Bitte gib eine gueltige E-Mail-Adresse ein.", { status: 400 })
      }

      if (!isValidPin(pin)) {
        console.warn("[public trainer access] validation failed", { step: "validation", email })
        return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      if (!phone) {
        console.warn("[public trainer access] validation failed", { step: "validation", email })
        return new NextResponse("Telefonnummer ist erforderlich.", { status: 400 })
      }

      const existingTrainer = await findTrainerByEmail(email)
      if (existingTrainer) {
        console.warn("[public trainer access] duplicate email", {
          step: "duplicate email",
          email,
          emailVerified: existingTrainer.email_verified,
          isApproved: existingTrainer.is_approved,
        })
        if (existingTrainer.is_approved) {
          return new NextResponse(DUPLICATE_EMAIL_MESSAGE, { status: 409 })
        }
        if (existingTrainer.email_verified) {
          return new NextResponse("Dieses Trainerkonto ist bereits bestaetigt und wartet nur noch auf die Admin-Freigabe.", { status: 409 })
        }
        return new NextResponse("Fuer diese E-Mail existiert bereits eine offene Trainerregistrierung.", { status: 409 })
      }

      let registerStep = "role assignment"

      try {
        registerStep = "member link"
        const linkedMember = await findMemberByEmail(email)
        const verificationToken = generateEmailVerificationToken()
        const verificationBaseUrl = getAppBaseUrl()
        const verificationLink = `${verificationBaseUrl}/trainer-zugang?${TRAINER_VERIFY_PARAM}=${verificationToken}`

        registerStep = "pin hash"
        registerStep = "db insert"
        await createTrainerAccount({
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || null,
          pin,
          email_verification_token: verificationToken,
          linked_member_id: linkedMember?.id ?? null,
        })

        registerStep = "send verification email"
        await sendVerificationEmail({
          email,
          name: `${firstName} ${lastName}`.trim(),
          link: verificationLink,
          kind: "trainer",
        })

        return NextResponse.json({ ok: true, email })
      } catch (error) {
        if (isTrainerAccountEmailConflict(error)) {
          console.warn("[public trainer access] duplicate email", { step: "duplicate email", email })
          return new NextResponse(DUPLICATE_EMAIL_MESSAGE, { status: 409 })
        }

        if (isMailDeliveryError(error)) {
          logTrainerAccessFailure(registerStep, error, { email })
          return new NextResponse(
            "Trainerzugang angelegt, aber die Bestaetigungs-E-Mail konnte nicht versendet werden. Bitte Admin informieren.",
            { status: 502 }
          )
        }

        logTrainerAccessFailure(registerStep, error, { email })
        return new NextResponse("Trainerregistrierung konnte nicht abgeschlossen werden. Bitte spaeter erneut versuchen.", {
          status: 500,
        })
      }
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

      try {
        await updateTrainerAccountPin(trainer.id, newPin)
      } catch (error) {
        logTrainerAccessFailure("pin hash", error, { email, trainerId: trainer.id })
        return new NextResponse("PIN konnte aktuell nicht aktualisiert werden. Bitte spaeter erneut versuchen.", {
          status: 500,
        })
      }

      return NextResponse.json({ ok: true, email })
    }

    return new NextResponse("Invalid action", { status: 400 })
  } catch (error) {
    logTrainerAccessFailure("unknown", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
