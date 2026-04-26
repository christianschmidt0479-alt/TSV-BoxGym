import { getMemberCheckinMode, FERIEN_CHECKIN_GROUPS, getSessionsForDate } from "@/lib/memberCheckin"
import { getActiveCheckinSession, isSessionOpenForCheckin } from "@/lib/checkinWindow"
import { createClient } from "@supabase/supabase-js"

export async function processMemberCheckin(input: {
  email?: string
  pin?: string
  token?: string
  ferienGroup?: string
}) {
  // 1. INPUT VALIDIERUNG
  // TODO: email oder token vorhanden?

  // 2. MITGLIED LADEN
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let member = null

  if (input.email) {
    const { data } = await supabase
      .from("members")
      .select("*")
      .eq("email", input.email)
      .maybeSingle()

    member = data
  }

  if (input.token) {
    const { data } = await supabase
      .from("members")
      .select("*")
      .eq("member_qr_token", input.token)
      .maybeSingle()

    member = data
  }

  if (!member) {
    return { ok: false, error: "Mitglied nicht gefunden" }
  }

  // 3. STATUS PRÜFEN
  if (!member.email_verified) {
    return { ok: false, error: "E-Mail nicht bestätigt" }
  }

  if (!member.is_approved) {
    return { ok: false, error: "Nicht freigegeben" }
  }

  if (!member.base_group) {
    return { ok: false, error: "Keine Gruppe zugeordnet" }
  }

  // 3a. PIN CHECK
  if (input.pin && member.member_pin !== input.pin) {
    return { ok: false, error: "PIN falsch" }
  }

  // SETTINGS LADEN
  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .limit(1)
    .maybeSingle()

  // MODUS BESTIMMEN
  const mode = getMemberCheckinMode(settings?.disableCheckinTimeWindow)

  // SESSION BESTIMMEN
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const dailySessions = getSessionsForDate(today)
  const session = getActiveCheckinSession(now, dailySessions)

  if (!session && mode === "normal") {
    return { ok: false, error: "Kein aktives Training" }
  }

  // ZEITFENSTER CHECK
  if (mode === "normal") {
    const isOpen = session ? isSessionOpenForCheckin(session, now) : false
    if (!isOpen) {
      return { ok: false, error: "Außerhalb des Zeitfensters" }
    }
  }

  // GRUPPENLOGIK
  let effectiveGroup = null

  if (mode === "normal") {
    effectiveGroup = member.base_group
  }

  if (mode === "ferien") {
    if (!input.ferienGroup) {
      return { ok: false, error: "Bitte Gruppe auswählen" }
    }
    const ferienGroup = input.ferienGroup as (typeof FERIEN_CHECKIN_GROUPS)[number]
    if (!FERIEN_CHECKIN_GROUPS.includes(ferienGroup)) {
      return { ok: false, error: "Ungültige Gruppe" }
    }
    // optional: Boxzwerge ausschließen
    if (member.base_group === "Boxzwerge") {
      return { ok: false, error: "Nicht im Ferienmodus erlaubt" }
    }
    effectiveGroup = ferienGroup
  }

  // DUPLICATE CHECK
  const { data: existingCheckin } = await supabase
    .from("checkins")
    .select("id")
    .eq("member_id", member.id)
    .eq("date", today)
    .limit(1)
    .maybeSingle()

  if (existingCheckin) {
    return { ok: false, error: "Bereits eingecheckt" }
  }

  // INSERT
  const { error: insertError } = await supabase
    .from("checkins")
    .insert({
      member_id: member.id,
      date: today,
      group: effectiveGroup
    })

  if (insertError) {
    if (process.env.NODE_ENV !== "production") {
      console.error(insertError)
    }
    return { ok: false, error: "Fehler beim Speichern" }
  }

  // 4. SETTINGS LADEN
  // TODO: Ferienmodus, disableCheckinTimeWindow

  // 5. MODUS BESTIMMEN
  // TODO: getMemberCheckinMode(...)

  // 6. ZEITFENSTER PRÜFEN
  // TODO:
  // - getActiveCheckinSession
  // - isSessionOpenForCheckin

  // 7. GRUPPE PRÜFEN
  // TODO:
  // - Ferienmodus → erlaubte Gruppen
  // - Normalmodus → base_group

  // 8. DUPLICATE CHECK
  // TODO:
  // checkins table prüfen

  // 9. CHECKIN ERSTELLEN
  // TODO:
  // insert in checkins

  // 10. RESPONSE
  return {
    ok: true,
    memberId: member.id,
    group: effectiveGroup,
    mode
  }
}
