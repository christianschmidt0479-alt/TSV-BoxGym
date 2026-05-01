import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type Body = {
  memberId?: unknown
}

function toText(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function getMemberDisplayName(member: { first_name?: string | null; last_name?: string | null; name?: string | null }) {
  const full = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return full || member.name || "—"
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-member-gs-manual-confirm:${getRequestIp(request)}`, 40, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json().catch(() => ({}))) as Body
    const memberId = toText(body.memberId)
    if (!memberId) {
      return NextResponse.json({ ok: false, error: "memberId fehlt." }, { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()

    const memberResult = await supabase
      .from("members")
      .select("id, name, first_name, last_name")
      .eq("id", memberId)
      .maybeSingle()

    if (memberResult.error) {
      throw memberResult.error
    }
    if (!memberResult.data) {
      return NextResponse.json({ ok: false, error: "Mitglied nicht gefunden." }, { status: 404 })
    }

    const checkedAt = new Date().toISOString()
    const updateResult = await supabase
      .from("members")
      .update({
        office_list_status: "green",
        office_list_checked_at: checkedAt,
        office_list_manual_confirmed: true,
      })
      .eq("id", memberId)

    if (updateResult.error) {
      throw updateResult.error
    }

    await writeAdminAuditLog({
      session,
      action: "member_gs_manual_confirmed",
      targetType: "member",
      targetId: memberId,
      targetName: getMemberDisplayName(memberResult.data),
      details: "GS-Status manuell bestätigt (green). Nur GS-Statusfelder aktualisiert.",
    })

    return NextResponse.json({
      ok: true,
      memberId,
      office_list_status: "green",
      office_list_checked_at: checkedAt,
      office_list_manual_confirmed: true,
    })
  } catch (error) {
    console.error("admin member gs manual confirm failed", error)
    return NextResponse.json({ ok: false, error: "Serverfehler" }, { status: 500 })
  }
}
