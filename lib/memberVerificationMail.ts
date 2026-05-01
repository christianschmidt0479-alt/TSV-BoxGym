// Neuer Mailbaustein für Mitglieder-Verifizierung

export type MemberVerificationMailInput = {
  email: string
  token: string
}

export async function sendMemberVerificationMail(input: MemberVerificationMailInput): Promise<void> {
  const { token } = input
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.tsvboxgym.de"
  const decision = "yes"
  const verifyUrl = `${baseUrl}/mitgliedschaft-bestaetigen/${decision}/${token}`
  try {
    // TODO: Echten Versand implementieren (z.B. via Resend)
    // await resend.emails.send({ ... })
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("MAIL_SEND_FAILED", err)
    }
  }
}
