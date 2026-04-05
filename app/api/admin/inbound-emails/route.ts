import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

async function requireAdmin(request: Request) {
  if (!isAllowedOrigin(request)) {
    return jsonError("Forbidden", 403)
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session || session.accountRole !== "admin") {
    return jsonError("Unauthorized", 401)
  }

  return null
}

export async function GET(request: Request) {
  try {
    const authError = await requireAdmin(request)
    if (authError) return authError

    const rateLimit = await checkRateLimitAsync(`admin-inbound-emails:${getRequestIp(request)}`, 120, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("inbound_emails")
      .select("id, from_email, to_email, subject, text, received_at")
      .order("received_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("[admin/inbound-emails] DB query failed", error)
      return jsonError("Konnte nicht geladen werden.", 500)
    }

    return NextResponse.json({ ok: true, emails: data ?? [] })
  } catch (error) {
    console.error("[admin/inbound-emails] Unexpected error", error)
    return jsonError("Internal server error", 500)
  }
}
