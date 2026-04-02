import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { verifyGsMembershipConfirmationToken } from "@/lib/gsMembershipConfirmation"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function isMissingAuditLogTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("admin_audit_log")
}

type RequestBody = {
  token?: string
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    let body: RequestBody | null = null
    try {
      body = (await request.json()) as RequestBody
    } catch {
      body = null
    }

    const payload = verifyGsMembershipConfirmationToken(body?.token?.trim() ?? "")
    if (!payload) {
      return NextResponse.json({ ok: false, error: "Link ungültig oder abgelaufen." }, { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, first_name, last_name, name")
      .eq("id", payload.memberId)
      .maybeSingle()

    if (memberError) {
      throw memberError
    }

    if (!member) {
      return NextResponse.json({ ok: false, error: "Mitglied nicht gefunden." }, { status: 404 })
    }

    const { data: existingLog, error: existingLogError } = await supabase
      .from("admin_audit_log")
      .select("id, created_at")
      .eq("action", "member_gs_confirmation_confirmed")
      .eq("target_type", "member")
      .eq("target_id", payload.memberId)
      .order("created_at", { ascending: false })
      .limit(1)

    if (existingLogError && !isMissingAuditLogTableError(existingLogError)) {
      throw existingLogError
    }

    const existingConfirmation = existingLog?.[0] ?? null
    if (!existingConfirmation) {
      const displayName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || member.name || "—"
      const { error: insertError } = await supabase.from("admin_audit_log").insert([
        {
          actor_role: "public",
          actor_email: null,
          actor_name: "GS Bestaetigungslink",
          action: "member_gs_confirmation_confirmed",
          target_type: "member",
          target_id: payload.memberId,
          target_name: displayName,
          details: "Mitgliedschaft per GS-Link bestaetigt.",
        },
      ])

      if (insertError && !isMissingAuditLogTableError(insertError)) {
        throw insertError
      }
    }

    return NextResponse.json({
      ok: true,
      alreadyConfirmed: !!existingConfirmation,
      memberId: payload.memberId,
    })
  } catch (error) {
    console.error("public gs membership confirm failed", error)
    return NextResponse.json({ ok: false, error: "Bestätigung konnte nicht verarbeitet werden." }, { status: 500 })
  }
}