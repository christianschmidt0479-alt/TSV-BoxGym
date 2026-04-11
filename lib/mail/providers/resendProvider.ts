// resendProvider: Adapter für Resend-Mailversand

import { Resend } from "resend"
import type { SendMailInput, SendMailResult } from "../mailService"

const resend = new Resend(process.env.RESEND_API_KEY)

export const resendProvider = {
  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    try {
      const result = await resend.emails.send({
        from: input.from || process.env.RESEND_FROM_EMAIL!,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      })
      console.log("MAIL_SEND_SUCCESS", { to: input.to, id: result.id })
      return { id: result.id }
    } catch (err) {
      console.error("MAIL_SEND_FAILED", { to: input.to, err })
      throw err
    }
  },
}
