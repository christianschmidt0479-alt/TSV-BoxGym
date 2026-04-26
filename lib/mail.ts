import { sendMemberVerificationMail } from "@/lib/mail/memberVerificationMail"

export async function sendVerificationMail(input: { to: string; token: string }) {
  await sendMemberVerificationMail({ email: input.to, token: input.token })
}
