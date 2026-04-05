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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authError = await requireAdmin(request)
    if (authError) return authError

    const rateLimit = await checkRateLimitAsync(
      `admin-inbound-emails-delete:${getRequestIp(request)}`,
      60,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const { id } = await params
    if (!id?.trim()) {
      return jsonError("Ungültige ID.", 400)
    }

    const supabase = createServerSupabaseServiceClient()
    const { error } = await supabase
      .from("inbound_emails")
      .delete()
      .eq("id", id.trim())

    if (error) {
      console.error("[admin/inbound-emails/[id]] DELETE failed", error)
      return jsonError("E-Mail konnte nicht gelöscht werden.", 500)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[admin/inbound-emails/[id]] Unexpected error", error)
    return jsonError("Internal server error", 500)
  }
}
