// resendProvider: Adapter für Resend-Mailversand

import { Resend } from "resend"
import type { SendMailInput, SendMailResult } from "../mailService"

const resend = new Resend(process.env.RESEND_API_KEY)

// Typisierung für Resend-Response (data kann null oder undefined sein)
type ResendSendResponse = {
  data?: { id?: string } | null
  error?: any
}

export const resendProvider = {
  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    // Debug-Log: Einstieg Resend-Provider
    console.log("RESEND_PROVIDER_SEND_START", { to: input.to })
    try {
      const result: ResendSendResponse = await resend.emails.send({
        from: input.from || process.env.RESEND_FROM_EMAIL!,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      })
      const id = result && result.data && typeof result.data === "object" && result.data !== null ? result.data.id : undefined
      console.log("MAIL_SEND_SUCCESS", { to: input.to, id })
      return { id }
    } catch (err) {
      console.error("MAIL_SEND_FAILED", { to: input.to, err })
      throw err
    }
  },
}
