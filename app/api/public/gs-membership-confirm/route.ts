import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { normalizeGsMembershipDecision, verifyGsMembershipConfirmationToken } from "@/lib/gsMembershipConfirmation"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

const GS_CONFIRMATION_YES_PREFIX = "gs_confirmed:"
const GS_CONFIRMATION_NO_PREFIX = "gs_rejected:"

function isMissingAuditLogTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("admin_audit_log")
}

type RequestBody = {
  token?: string
  decision?: string
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

    const decision = normalizeGsMembershipDecision(body?.decision)
    if (!decision) {
      return NextResponse.json({ ok: false, error: "Entscheidung fehlt oder ist ungültig." }, { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, first_name, last_name, name, email_verified, email_verification_token")
      .eq("id", payload.memberId)
      .maybeSingle()

    if (memberError) {
      throw memberError
    }

    if (!member) {
      return NextResponse.json({ ok: false, error: "Mitglied nicht gefunden." }, { status: 404 })
    }

    if (!member.email_verified) {
      return NextResponse.json({ ok: false, error: "Mitglied muss zuerst die E-Mail bestätigen." }, { status: 400 })
    }

    const existingToken = typeof member.email_verification_token === "string" ? member.email_verification_token : ""
    const existingDecision = existingToken.startsWith(GS_CONFIRMATION_YES_PREFIX)
      ? "ja"
      : existingToken.startsWith(GS_CONFIRMATION_NO_PREFIX)
        ? "nein"
        : null
    const existingStamp = existingDecision === "ja"
      ? existingToken.slice(GS_CONFIRMATION_YES_PREFIX.length)
      : existingDecision === "nein"
        ? existingToken.slice(GS_CONFIRMATION_NO_PREFIX.length)
        : ""
    const confirmationStamp = existingDecision === decision && existingStamp ? existingStamp : new Date().toISOString()
    const decisionPrefix = decision === "ja" ? GS_CONFIRMATION_YES_PREFIX : GS_CONFIRMATION_NO_PREFIX
    const decisionAction = decision === "ja" ? "member_gs_confirmation_confirmed" : "member_gs_confirmation_rejected"
    const decisionDetails = decision === "ja" ? "Mitgliedschaft per GS-Link bestätigt." : "Mitgliedschaft per GS-Link als nicht vorhanden markiert."
    const actorName = decision === "ja" ? "GS Ja-Link" : "GS Nein-Link"

    if (existingDecision !== decision || existingStamp !== confirmationStamp) {
      const { error: updateMemberError } = await supabase
        .from("members")
        .update({ email_verification_token: `${decisionPrefix}${confirmationStamp}` })
        .eq("id", payload.memberId)

      if (updateMemberError) {
        throw updateMemberError
      }
    }

    if (existingDecision !== decision) {
      const displayName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || member.name || "—"
      const { error: insertError } = await supabase.from("admin_audit_log").insert([
        {
          actor_role: "public",
          actor_email: null,
          actor_name: actorName,
          action: decisionAction,
          target_type: "member",
          target_id: payload.memberId,
          target_name: displayName,
          details: decisionDetails,
        },
      ])

      if (insertError && !isMissingAuditLogTableError(insertError)) {
        throw insertError
      }
    }

    return NextResponse.json({
      ok: true,
      decision,
      alreadyProcessed: existingDecision === decision,
      memberId: payload.memberId,
      confirmedAt: confirmationStamp,
    })
  } catch (error) {
    console.error("public gs membership confirm failed", error)
    return NextResponse.json({ ok: false, error: "Bestätigung konnte nicht verarbeitet werden." }, { status: 500 })
  }
}