// Fachlicher Mailbaustein für Mitglieder-Verifizierung
import { sendMail } from "./mailService"

export type MemberVerificationMailInput = {
  email: string
  token: string
}

export async function sendMemberVerificationMail(input: MemberVerificationMailInput): Promise<void> {
  const { email, token } = input
  // Verify-Link bauen
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/mitgliedschaft-bestaetigen?token=${token}`

  // Mailinhalt bauen
  const subject = "Bitte bestätige deine Registrierung – TSV BoxGym"
  const html = `
    <p>Bitte bestätige deine E-Mail:</p>
    <p><a href="${verifyUrl}">Jetzt bestätigen</a></p>
  `
  const text = `Bitte bestätige deine E-Mail: ${verifyUrl}`

  // Fachliches Logging (optional)
  console.log("MEMBER_VERIFICATION_MAIL_SEND", { email })

  // MailService aufrufen
  await sendMail({
    to: email,
    subject,
    html,
    text,
  })
}
