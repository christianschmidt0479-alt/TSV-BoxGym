// Fachlicher Mailbaustein für Mitglieder-Verifizierung
import { sendMail } from "./mailService"
import { buildMemberMail } from "./renderMailTemplate"
import { getAppBaseUrl, DEFAULT_APP_BASE_URL } from "../mailConfig"

export type MemberVerificationMailInput = {
  email: string
  token: string
}

export async function sendMemberVerificationMail(input: MemberVerificationMailInput): Promise<void> {
  const { email, token } = input
  const trimmedToken = token.trim()
  if (!trimmedToken) {
    throw new Error("Verification token fehlt")
  }

  const BASE_URL = getAppBaseUrl() || DEFAULT_APP_BASE_URL
  if (!BASE_URL) {
    throw new Error("BASE_URL fehlt")
  }

  const verifyUrl = `${BASE_URL}/mein-bereich/verifizieren?token=${trimmedToken}`

  if (process.env.NODE_ENV !== "production") {
    console.log("VERIFICATION LINK", verifyUrl)
  }

  // Mailinhalt bauen (zentral, professionell, mobilfreundlich)
  const subject = "E-Mail-Adresse bestätigen – TSV BoxGym"
  const html = buildMemberMail({
    title: "E-Mail-Adresse bestätigen",
    intro: "Vielen Dank für deine Registrierung im TSV BoxGym. Bitte bestätige jetzt deine E-Mail-Adresse.",
    ctaLabel: "E-Mail jetzt bestätigen",
    ctaUrl: verifyUrl,
    securityNotice: "Falls du dich nicht registriert hast, ignorieren."
  })
  const text = `Bitte bestätige deine E-Mail-Adresse für den TSV BoxGym: ${verifyUrl}\n\nFalls du dich nicht selbst registriert hast, kannst du diese E-Mail ignorieren.`

  // MailService aufrufen
  await sendMail({
    to: email,
    subject,
    html,
    text,
  })
}
