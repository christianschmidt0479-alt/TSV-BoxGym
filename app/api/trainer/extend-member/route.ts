import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyTrainerSessionToken } from "@/lib/authSession"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

/**
 * POST /api/trainer/extend-member
 *
 * Trainer grants a one-time trial extension to a trial member.
 * Sets member_phase = 'extended', allowing up to 8 check-ins instead of 3.
 *
 * Body: { memberId: string }
 * Requires: valid trainer_session cookie
 */
export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Auth: require valid trainer session
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get("trainer_session")?.value

  if (!sessionToken) {
    return NextResponse.json({ ok: false, error: "Nicht autorisiert" }, { status: 401 })
  }

  const session = await verifyTrainerSessionToken(sessionToken)
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session ungültig" }, { status: 401 })
  }

  // Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültiger Request-Body" }, { status: 400 })
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).memberId !== "string"
  ) {
    return NextResponse.json({ ok: false, error: "memberId fehlt oder ungültig" }, { status: 400 })
  }

  const memberId = ((body as Record<string, unknown>).memberId as string).trim()
  if (!memberId) {
    return NextResponse.json({ ok: false, error: "memberId darf nicht leer sein" }, { status: 400 })
  }

  const supabase = createServerSupabaseServiceClient()

  // Load current member to validate pre-conditions
  const { data: member, error: fetchError } = await supabase
    .from("members")
    .select("id, is_trial, member_phase")
    .eq("id", memberId)
    .maybeSingle()

  if (fetchError) throw fetchError

  if (!member) {
    // TEMP LIVE MONITORING
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[trainer-flow][extend][blocked] reason=not_found id=${memberId}`)
    }
    return NextResponse.json({ ok: false, error: "Mitglied nicht gefunden" }, { status: 404 })
  }

  if (!member.is_trial) {
    // TEMP LIVE MONITORING
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[trainer-flow][extend][blocked] reason=not_trial id=${memberId}`)
    }
    return NextResponse.json(
      { ok: false, error: "Nur Probemitglieder können verlängert werden" },
      { status: 422 }
    )
  }

  if (member.member_phase === "extended") {
    // TEMP LIVE MONITORING
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[trainer-flow][extend][blocked] reason=already_extended id=${memberId}`)
    }
    return NextResponse.json(
      { ok: false, error: "Probetraining wurde bereits verlängert" },
      { status: 422 }
    )
  }

  // Apply extension
  const { error: updateError } = await supabase
    .from("members")
    .update({ member_phase: "extended" })
    .eq("id", memberId)

  if (updateError) throw updateError

  // TEMP LIVE MONITORING
  if (process.env.NODE_ENV !== "production") {
    console.info(`[trainer-flow][extend][success] id=${memberId}`)
  }

  return NextResponse.json({ ok: true })
}
