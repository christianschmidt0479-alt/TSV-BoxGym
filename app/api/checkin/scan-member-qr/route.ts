import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin, sanitizeTextInput } from "@/lib/apiSecurity"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function isMissingQrMemberColumnError(error: { message?: string; details?: string; code?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()

  return (
    error?.code === "42703" ||
    (message.includes("member_qr_token") && message.includes("does not exist")) ||
    (message.includes("member_qr_active") && message.includes("does not exist")) ||
    message.includes("schema cache")
  )
}

/**
 * POST /api/checkin/scan-member-qr
 *
 * Finds a member by their opaque QR token.
 * Does NOT perform a check-in yet – the route is wired up and ready for
 * future use by a Trainer or hardware scanner.
 *
 * Body: { token: string }
 *
 * Success 200: { member: { id, name, first_name, last_name, is_approved, is_trial, base_group } }
 * 400: missing/invalid token
 * 403: unknown origin
 * 404: token not found or member inactive
 * 429: rate-limited
 */
export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const ip = getRequestIp(request)
    const rateLimit = await checkRateLimitAsync(`scan-member-qr:${ip}`, 30, 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as { token?: unknown }
    const token = sanitizeTextInput(body.token, { maxLength: 64 })

    if (!token) {
      return new NextResponse("Token fehlt.", { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()

    const { data, error } = await supabase
      .from("members")
      .select("id, name, first_name, last_name, is_approved, is_trial, base_group, member_qr_active")
      .eq("member_qr_token", token)
      .maybeSingle()

    if (error) {
      if (isMissingQrMemberColumnError(error)) {
        return new NextResponse("QR-Code-Funktion ist noch nicht vollständig aktiviert.", { status: 503 })
      }

      throw error
    }

    if (!data || data.member_qr_active === false) {
      return new NextResponse("QR-Code nicht gefunden oder deaktiviert.", { status: 404 })
    }

    return NextResponse.json({
      member: {
        id: data.id,
        name: data.name,
        first_name: data.first_name,
        last_name: data.last_name,
        is_approved: data.is_approved,
        is_trial: data.is_trial,
        base_group: data.base_group,
      },
    })
  } catch (error) {
    console.error("scan-member-qr failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
