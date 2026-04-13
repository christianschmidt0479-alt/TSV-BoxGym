import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { getMemberCheckinMode, getSessionsForDate, resolveMemberCheckinAssignment, checkMemberEligibility, FERIEN_CHECKIN_GROUPS } from "@/lib/memberCheckin"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"

/**
 * POST /api/checkin/member
 * Neuer, isolierter Mitglieder-Check-in-Endpoint
 *
 * Body: { email: string, pin: string }
 *
 * Erfolgreich: 200 { ok: true }
 * Fehler: 400/401/409 mit klarer Fehlermeldung
 */
export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as { email?: string; pin?: string; ferienGroup?: string }
    const email = body.email?.trim().toLowerCase() ?? ""
    const pin = body.pin?.trim() ?? ""
    const ferienGroup = body.ferienGroup?.trim() ?? ""
    if (!email || !pin) {
      return new NextResponse("Bitte E-Mail und PIN eingeben.", { status: 400 })
    }

    const rateLimit = await checkRateLimitAsync(
      `new-member-checkin:${getRequestIp(request)}:${email}`,
      20,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Zu viele Versuche. Bitte warte kurz.", { status: 429 })
    }

    const supabase = createServerSupabaseServiceClient()
    // Mitglied suchen
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, email_verified, is_approved, base_group, member_pin")
      .eq("email", email)
      .maybeSingle()
    if (memberError) throw memberError
    if (!member) {
      return new NextResponse("Mitglied nicht gefunden oder PIN falsch.", { status: 401 })
    }
    if (member.member_pin !== pin) {
      return new NextResponse("Mitglied nicht gefunden oder PIN falsch.", { status: 401 })
    }
    if (!member.email_verified) {
      return new NextResponse("E-Mail noch nicht bestätigt.", { status: 400 })
    }
    if (!member.is_approved) {
      return new NextResponse("Mitglied ist noch nicht freigegeben.", { status: 400 })
    }
    if (!member.base_group) {
      return new NextResponse("Keine Trainingsgruppe hinterlegt.", { status: 400 })
    }

    // Settings/Modus bestimmen
    const settings = await readCheckinSettings()
    const checkinMode = getMemberCheckinMode(settings.disableCheckinTimeWindow)
    const now = new Date()
    const liveDate = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

    if (checkinMode === "ferien") {
      // Ferienmodus: Gruppe ist Pflicht
      if (!ferienGroup) {
        return new NextResponse("Bitte eine Gruppe auswählen.", { status: 400 })
      }
      if (!FERIEN_CHECKIN_GROUPS.includes(ferienGroup as any)) {
        return new NextResponse("Ungültige Gruppe.", { status: 400 })
      }
      // Tages-Dublettenprüfung
      const { data: existing, error: existingError } = await supabase
        .from("checkins")
        .select("id")
        .eq("member_id", member.id)
        .eq("date", liveDate)
        .eq("checkin_mode", "ferien")
        .maybeSingle()
      if (existingError) throw existingError
      if (existing) {
        return new NextResponse("Du bist heute bereits eingecheckt.", { status: 409 })
      }
      // Check-in schreiben
      const { error: insertError } = await supabase.from("checkins").insert({
        member_id: member.id,
        group_name: ferienGroup,
        session_id: null,
        date: liveDate,
        time: now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }),
        checkin_mode: "ferien",
      })
      if (insertError) throw insertError
      return NextResponse.json({ ok: true })
    }

    // Normalmodus wie bisher
    const todaysSessions = getSessionsForDate(liveDate)
    const assignment = resolveMemberCheckinAssignment({
      dailySessions: todaysSessions,
      now,
      baseGroup: member.base_group,
      mode: checkinMode,
    })
    if (!assignment.allowed || !assignment.session) {
      return new NextResponse("Kein passendes Zeitfenster für Check-in.", { status: 400 })
    }
    // Doppel-Check-in prüfen (Session)
    const { data: existing, error: existingError } = await supabase
      .from("checkins")
      .select("id")
      .eq("member_id", member.id)
      .eq("session_id", assignment.session.id)
      .eq("date", liveDate)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      return new NextResponse("Du bist für diese Einheit bereits eingecheckt.", { status: 409 })
    }
    // Check-in schreiben
    const { error: insertError } = await supabase.from("checkins").insert({
      member_id: member.id,
      group_name: assignment.groupName,
      session_id: assignment.session.id,
      date: liveDate,
      time: now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }),
      checkin_mode: checkinMode,
    })
    if (insertError) throw insertError
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[new-checkin] error", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
