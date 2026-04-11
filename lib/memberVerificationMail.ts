// Neuer Mailbaustein für Mitglieder-Verifizierung

export type MemberVerificationMailInput = {
  email: string
  token: string
}

export async function sendMemberVerificationMail(input: MemberVerificationMailInput): Promise<void> {
  const { email, token } = input
  // Verify-Link bauen
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/mitgliedschaft-bestaetigen?token=${token}`

  // Logging
  console.log("MAIL_SEND_START", { email })
  try {
    // TODO: Echten Versand implementieren (z.B. via Resend)
    // await resend.emails.send({ ... })
    console.log("MAIL_SEND_SUCCESS", { email })
  } catch (err) {
    console.error("MAIL_SEND_FAILED", { email, err })
  }
}
