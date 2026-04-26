// Neuer Mailbaustein für Mitglieder-Verifizierung

export type MemberVerificationMailInput = {
  email: string
  token: string
}

export async function sendMemberVerificationMail(input: MemberVerificationMailInput): Promise<void> {
  const { token } = input
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/mitgliedschaft-bestaetigen?token=${token}`
  try {
    // TODO: Echten Versand implementieren (z.B. via Resend)
    // await resend.emails.send({ ... })
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("MAIL_SEND_FAILED", err)
    }
  }
}
