type VerificationMailInput = {
  email: string
  name?: string
  link: string
}

export async function sendVerificationEmail(input: VerificationMailInput) {
  const apiKey = process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || "TSV BoxGym <onboarding@resend.dev>"

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Bitte E-Mail fuer dein TSV BoxGym Konto bestaetigen",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #18181b;">
          <h2 style="margin-bottom: 16px;">TSV BoxGym</h2>
          <p>Hallo${input.name ? ` ${input.name}` : ""},</p>
          <p>bitte bestaetige deine E-Mail-Adresse fuer dein Konto.</p>
          <p>
            <a href="${input.link}" style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #154c83; color: #ffffff; text-decoration: none; font-weight: 600;">
              E-Mail bestaetigen
            </a>
          </p>
          <p>Falls der Button nicht funktioniert, kannst du diesen Link direkt oeffnen:</p>
          <p><a href="${input.link}">${input.link}</a></p>
        </div>
      `,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend request failed")
  }
}
