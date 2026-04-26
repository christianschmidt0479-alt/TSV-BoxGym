import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { getAppBaseUrl, DEFAULT_APP_BASE_URL } from "@/lib/mailConfig"
import { buildAdminMailDraftPreview } from "@/lib/adminMailComposer"
import { sendCustomEmail } from "@/lib/resendClient"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"

function generateEmailVerificationToken() {
  return randomUUID()
}

export async function POST(request: Request) {
  try {
    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    let body: unknown = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 })
    }

    const { memberId } = body as { memberId?: string }
    if (!memberId) {
      return NextResponse.json({ ok: false, error: "Missing memberId" }, { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()
    const { data: member, error } = await supabase
      .from("members")
      .select("id, email, first_name, last_name, email_verification_token")
      .eq("id", memberId)
      .maybeSingle()
    if (error) {
      console.error("SUPABASE ERROR:", error)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }
    if (!member) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
    }

    if (member.email_verification_token) {
      return NextResponse.json({ ok: false, reason: "token_exists" }, { status: 200 })
    }

    const token = generateEmailVerificationToken()
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString()

    const { error: updateError } = await supabase
      .from("members")
      .update({ email_verification_token: token, email_verification_expires_at: expiresAt })
      .eq("id", memberId)
    if (updateError) {
      console.error("SUPABASE ERROR:", updateError)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }

    const baseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
    const link = `${baseUrl}/mein-bereich?verify=${token}`

    let mailSent = false
    let mailError = null
    if (member.email) {
      try {
        const preview = await buildAdminMailDraftPreview({
          kind: "verification",
          email: member.email,
          name: `${member.first_name || ""} ${member.last_name || ""}`.trim(),
          link,
          targetKind: "member",
        })
        await sendCustomEmail({
          to: member.email,
          subject: preview.subject,
          text: preview.body,
          replyTo: preview.replyTo,
        })
        mailSent = true
      } catch (err) {
        mailError = err instanceof Error ? err.message : String(err)
      }
    }

    return NextResponse.json({
      ok: true,
      link,
      email: member.email,
      mailSent,
      mailError,
    })
  } catch (error) {
    console.error("API ERROR:", error)
    return new Response(JSON.stringify({ error: true, message: "Serverfehler" }), { status: 500 })
  }
}
