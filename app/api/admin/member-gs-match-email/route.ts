import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type Body = {
  memberId?: unknown
  gsMatchEmail?: unknown
}

function toText(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
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

    const rateLimit = await checkRateLimitAsync(`admin-member-gs-match-email:${getRequestIp(request)}`, 40, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json().catch(() => ({}))) as Body
    const memberId = toText(body.memberId)
    const rawGsMatchEmail = toText(body.gsMatchEmail)
    const normalizedGsMatchEmail = rawGsMatchEmail ? normalizeEmail(rawGsMatchEmail) : null

    if (!memberId) {
      return NextResponse.json({ ok: false, error: "memberId fehlt." }, { status: 400 })
    }

    if (normalizedGsMatchEmail && !isValidEmail(normalizedGsMatchEmail)) {
      return NextResponse.json({ ok: false, error: "Ungültige E-Mail-Adresse." }, { status: 400 })
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

    const updateResult = await supabase
      .from("members")
      .update({
        gs_match_email: normalizedGsMatchEmail,
      })
      .eq("id", memberId)

    if (updateResult.error) {
      throw updateResult.error
    }

    await writeAdminAuditLog({
      session,
      action: "member_gs_match_email_updated",
      targetType: "member",
      targetId: memberId,
      targetName: getMemberDisplayName(memberResult.data),
      details: normalizedGsMatchEmail
        ? "GS-Abgleich E-Mail gesetzt/aktualisiert."
        : "GS-Abgleich E-Mail entfernt.",
    })

    return NextResponse.json({
      ok: true,
      memberId,
      gs_match_email: normalizedGsMatchEmail,
    })
  } catch (error) {
    console.error("admin member gs match email update failed", error)
    return NextResponse.json({ ok: false, error: "Serverfehler" }, { status: 500 })
  }
}
