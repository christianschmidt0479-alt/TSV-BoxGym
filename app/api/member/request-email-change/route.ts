import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { getMemberFromSession } from "@/lib/memberAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { sendVerificationMail } from "@/lib/mail"

type EmailChangeBody = {
  email?: string
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export async function POST(req: Request) {
  const member = await getMemberFromSession()

  if (!member) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as EmailChangeBody | null
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : ""

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 })
  }

  const token = randomUUID()

  const { error } = await supabaseAdmin
    .from("members")
    .update({
      email,
      email_verification_token: token,
      email_verified: false,
      email_verified_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", member.id)

  if (error) {
    return NextResponse.json({ error: "email_change_failed" }, { status: 500 })
  }

  await sendVerificationMail({
    to: email,
    token,
  })

  return NextResponse.json({ ok: true })
}
