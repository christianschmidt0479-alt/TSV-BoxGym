// resendProvider: Adapter für Resend-Mailversand

import { Resend } from "resend"
import type { SendMailInput, SendMailResult } from "../mailService"
import { getMailFromAddress } from "@/lib/mailConfig"

const resend = new Resend(process.env.RESEND_API_KEY)

// Typisierung für Resend-Response (data kann null oder undefined sein)
type ResendSendResponse = {
  data?: { id?: string } | null
  error?: any
}

export const resendProvider = {
  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    try {
      const result: ResendSendResponse = await resend.emails.send({
        from: input.from || getMailFromAddress(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      })
      const id = result && result.data && typeof result.data === "object" && result.data !== null ? result.data.id : undefined
      return { id }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("MAIL_SEND_FAILED", err)
      }
      throw err
    }
  },
}
