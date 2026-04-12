// Fachlicher Mailbaustein für Mitglieder-Verifizierung
import { sendMail } from "./mailService"
import { buildMemberMail } from "./renderMailTemplate"

export type MemberVerificationMailInput = {
  email: string
  token: string
}

export async function sendMemberVerificationMail(input: MemberVerificationMailInput): Promise<void> {
  // Debug-Log: Einstieg Mailbaustein
  console.log("MEMBER_VERIFICATION_MAIL_START", { email: input.email })
  const { email, token } = input
  // Verify-Link bauen
  const verificationLink = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/mein-bereich?verify=${token}`

  // Mailinhalt bauen (zentral, professionell, mobilfreundlich)
  const subject = "E-Mail-Adresse bestätigen – TSV BoxGym"
  const html = buildMemberMail({
    title: "E-Mail-Adresse bestätigen",
    intro: "Vielen Dank für deine Registrierung im TSV BoxGym. Bitte bestätige jetzt deine E-Mail-Adresse.",
    ctaLabel: "E-Mail jetzt bestätigen",
    ctaUrl: verificationLink,
    securityNotice: "Falls du dich nicht registriert hast, ignorieren."
  })
  const text = `Bitte bestätige deine E-Mail-Adresse für den TSV BoxGym: ${verificationLink}\n\nFalls du dich nicht selbst registriert hast, kannst du diese E-Mail ignorieren.`

  // MailService aufrufen
  await sendMail({
    to: email,
    subject,
    html,
    text,
  })
}
