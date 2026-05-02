import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import Link from "next/link"
import { findMemberById } from "@/lib/boxgymDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { MAX_TRAININGS_WITHOUT_APPROVAL } from "@/lib/memberCheckin"
import { getTodayIsoDateInBerlin, isTodayCheckinInBerlin } from "@/lib/dateFormat"
import { getUserContext } from "@/lib/getUserContext"
import { MEMBER_AREA_SESSION_COOKIE, readMemberSession } from "@/lib/publicAreaSession"
import { resolveUserContext } from "@/lib/resolveUserContext"
import { MemberAreaBrandHeader } from "@/components/member-area/MemberAreaBrandHeader"
import { FormContainer } from "@/components/ui/form-container"
import { needsWeight } from "@/lib/memberUtils"
import { analyzeWeightProgress } from "@/lib/weightAnalysis"

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const hadMemberSessionCookie = Boolean(cookieStore.get(MEMBER_AREA_SESSION_COOKIE)?.value)
  const memberSession = await readMemberSession(cookieStore)
  const showPasswordUpdateHint = memberSession?.needsPasswordUpdate === true
  const resolvedContext = await resolveUserContext()

  if (!resolvedContext.isLoggedIn) {
    redirect(hadMemberSessionCookie ? "/mein-bereich/login?reason=session_expired" : "/mein-bereich/login")
  }

  const context = await getUserContext()
  let memberId = resolvedContext.memberId ?? null
  let role: "member" | "trainer" | "admin" = context?.role === "admin" ? "admin" : context?.role === "trainer" ? "trainer" : "member"

  if (!memberId) {
    const member = await findMemberById(resolvedContext.memberId ?? "")
    if (!member?.id) {
      redirect("/mein-bereich/login")
    }

    memberId = member.id
    role = "member"
  }

  const isAdmin = role === "admin"
  const supabase = createServerSupabaseServiceClient()
  let member: {
    first_name: string | null
    last_name: string | null
    email: string | null
    base_group: string | null
    is_approved: boolean | null
    email_verified: boolean | null
    is_competition_member: boolean | null
    competition_target_weight: number | null
  } | null = null
  if (memberId) {
    const { data } = await supabase
      .from("members")
      .select(`
        first_name,
        last_name,
        email,
        base_group,
        is_approved,
        email_verified,
        is_competition_member,
        competition_target_weight
      `)
      .eq("id", memberId)
      .single()
    member = data
  }

  let lastCheckin: { created_at: string } | null = null
  let totalCheckins = 0
  let monthCheckins = 0
  if (memberId) {
    const todayIsoDate = getTodayIsoDateInBerlin()
    const currentMonthKey = todayIsoDate.slice(0, 7)

    const [lastCheckinResponse, totalCountResponse, monthCountResponse] = await Promise.all([
      supabase
        .from("checkins")
        .select("created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("member_id", memberId),
      supabase
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("member_id", memberId)
        .eq("month_key", currentMonthKey),
    ])

    lastCheckin = lastCheckinResponse.data
    totalCheckins = totalCountResponse.count ?? 0
    monthCheckins = monthCountResponse.count ?? 0
  }

  let trainingsWithoutApprovalUsed = 0
  if (memberId && member && !member.is_approved) {
    const { count } = await supabase
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("member_id", memberId)

    trainingsWithoutApprovalUsed = count ?? 0
  }

  let hasCheckedInToday = false

  if (lastCheckin?.created_at) {
    hasCheckedInToday = isTodayCheckinInBerlin({ created_at: lastCheckin.created_at })
  }

  // Gewicht & Ziel — nur für Wettkämpfer / L-Gruppe
  type WeightLogEntry = { created_at: string; weight_kg: number; source: string }
  let weightData: {
    targetWeightKg: number | null
    lastWeightKg: number | null
    weightDistanceKg: number | null
    weightLogs: WeightLogEntry[]
    analysis: ReturnType<typeof analyzeWeightProgress>
  } | null = null

  if (memberId && member && needsWeight(member)) {
    const targetWeightKg = typeof member.competition_target_weight === "number"
      ? member.competition_target_weight
      : null

    // Versuche member_weight_logs (Phase 2 Tabelle), fallback auf checkins.weight
    let weightLogs: WeightLogEntry[] = []
    let lastWeightKg: number | null = null

    try {
      const { data: logRows, error: logError } = await supabase
        .from("member_weight_logs")
        .select("created_at, weight_kg, source")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(10)

      if (!logError && logRows && logRows.length > 0) {
        weightLogs = logRows as WeightLogEntry[]
        lastWeightKg = weightLogs[0]?.weight_kg ?? null
      } else {
        // Fallback: checkins.weight
        const { data: checkinWeightRows } = await supabase
          .from("checkins")
          .select("created_at, weight")
          .eq("member_id", memberId)
          .not("weight", "is", null)
          .order("created_at", { ascending: false })
          .limit(10)

        if (checkinWeightRows && checkinWeightRows.length > 0) {
          weightLogs = checkinWeightRows
            .filter((r) => r.weight !== null)
            .map((r) => ({
              created_at: r.created_at,
              weight_kg: Number(r.weight),
              source: "checkin",
            }))
          lastWeightKg = weightLogs[0]?.weight_kg ?? null
        }
      }
    } catch {
      // Tabelle fehlt oder Query-Fehler — kein Absturz
    }

    const analysis = analyzeWeightProgress({
      targetWeightKg,
      logs: weightLogs,
    })

    const weightDistanceKg = analysis.distanceKg

    weightData = { targetWeightKg, lastWeightKg, weightDistanceKg, weightLogs, analysis }
  }

  const memberName = member ? `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "Unbekannt" : ""
  const memberGroup = member?.base_group || "Keine Gruppe zugewiesen"
  const lastCheckinDisplay = lastCheckin?.created_at
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Berlin",
      }).format(new Date(lastCheckin.created_at))
    : "-"
  const stats = {
    monthCount: monthCheckins,
    streak: totalCheckins,
    lastCheckin: lastCheckinDisplay,
  }

  return (
    <FormContainer rootClassName="!min-h-[calc(100svh-11rem)] !py-3 md:!py-5">
      <div className="space-y-4 sm:space-y-5">
        <MemberAreaBrandHeader
          title="Mein Bereich"
          subtitle="Deine Übersicht für Training und Kontostatus"
        />

        {showPasswordUpdateHint ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>Dein Zugang bleibt aktiv. Für mehr Sicherheit empfehlen wir, dein Passwort zu aktualisieren.</p>
            <Link
              href="/mein-bereich/passwort-aendern"
              className="mt-2 inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Jetzt aktualisieren
            </Link>
          </div>
        ) : null}

        <div className="rounded-2xl border border-[#154c83] bg-[#154c83] px-4 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">Status</p>
          <p className="mt-1 text-lg font-semibold leading-tight">{memberName}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:text-sm">
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-blue-100">Gruppe</p>
              <p className="mt-0.5 font-semibold text-white">{memberGroup || "-"}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-blue-100">Freigabe</p>
              <p className="mt-0.5 font-semibold text-white">{member?.is_approved ? "Aktiv" : "Nicht freigegeben"}</p>
            </div>
          </div>

          {!member?.is_approved ? (
            <p className="mt-3 text-xs text-blue-100">
              Verbleibende Trainings ohne Freigabe: {Math.max(MAX_TRAININGS_WITHOUT_APPROVAL - trainingsWithoutApprovalUsed, 0)}
            </p>
          ) : null}

          {hasCheckedInToday ? (
            <p className="mt-2 text-xs font-semibold text-emerald-200">Heute bereits eingecheckt</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Training</p>
          <p className="mt-1 text-3xl font-extrabold text-zinc-900">{stats?.monthCount || 0}</p>
          <p className="text-sm text-zinc-600">diesen Monat</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">Check-ins gesamt</p>
              <p className="mt-0.5 font-semibold text-zinc-900">{stats?.streak || 0}</p>
            </div>
            <div className="rounded-xl bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">Letztes Training</p>
              <p className="mt-0.5 font-semibold text-zinc-900">{stats?.lastCheckin || "-"}</p>
            </div>
          </div>
        </div>

        {weightData ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Gewicht &amp; Ziel</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-zinc-50 px-3 py-2">
                <p className="text-zinc-500">Zielgewicht</p>
                <p className="mt-0.5 font-semibold text-zinc-900">
                  {weightData.targetWeightKg !== null
                    ? `${weightData.targetWeightKg} kg`
                    : "Noch kein Zielgewicht hinterlegt"}
                </p>
              </div>
              <div className="rounded-xl bg-zinc-50 px-3 py-2">
                <p className="text-zinc-500">Letztes Gewicht</p>
                <p className="mt-0.5 font-semibold text-zinc-900">
                  {weightData.lastWeightKg !== null
                    ? `${weightData.lastWeightKg} kg`
                    : "Noch kein Gewicht erfasst"}
                </p>
              </div>
              {weightData.weightDistanceKg !== null ? (
                <div className="col-span-2 rounded-xl bg-zinc-50 px-3 py-2">
                  <p className="text-zinc-500">Abstand zum Ziel</p>
                  <p className={`mt-0.5 font-semibold ${weightData.weightDistanceKg <= 0 ? "text-emerald-700" : "text-zinc-900"}`}>
                    {weightData.weightDistanceKg > 0
                      ? `+${weightData.weightDistanceKg} kg über Ziel`
                      : weightData.weightDistanceKg < 0
                      ? `${Math.abs(weightData.weightDistanceKg)} kg unter Ziel`
                      : "Genau auf Zielgewicht"}
                  </p>
                </div>
              ) : null}
              <div className="col-span-2 rounded-xl bg-zinc-50 px-3 py-2">
                <p className="text-zinc-500">Zielbereich</p>
                <p className="mt-0.5 font-semibold text-zinc-900">
                  {weightData.analysis.status === "in_range"
                    ? "Im Zielbereich"
                    : weightData.analysis.status === "near_target"
                    ? "Nahe am Zielbereich"
                    : weightData.analysis.status === "above_target"
                    ? "Über Zielbereich"
                    : weightData.analysis.status === "below_target"
                    ? "Unter Zielbereich"
                    : weightData.analysis.status === "needs_attention"
                    ? "Deutliche Abweichung"
                    : weightData.analysis.status === "no_target"
                    ? "Kein Zielgewicht hinterlegt"
                    : "Kein Gewichtseintrag"}
                </p>
              </div>
              <div className="col-span-2 rounded-xl bg-zinc-50 px-3 py-2">
                <p className="text-zinc-500">Verlaufstendenz</p>
                <p className="mt-0.5 font-semibold text-zinc-900">
                  {weightData.analysis.trend === "rising"
                    ? "Steigend"
                    : weightData.analysis.trend === "falling"
                    ? "Fallend"
                    : weightData.analysis.trend === "stable"
                    ? "Stabil"
                    : "Nicht bestimmbar"}
                </p>
              </div>
            </div>
            {weightData.weightLogs.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-zinc-500">Verlauf</p>
                <ul className="mt-1.5 space-y-1">
                  {weightData.weightLogs.slice(0, 5).map((entry, i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-sm">
                      <span className="text-zinc-500">
                        {new Intl.DateTimeFormat("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          timeZone: "Europe/Berlin",
                        }).format(new Date(entry.created_at))}
                      </span>
                      <span className="font-semibold text-zinc-900">{entry.weight_kg} kg</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-zinc-500">{weightData.analysis.message}</p>
            <p className="mt-1 text-xs text-zinc-400">
              Hinweis: Diese Auswertung dient ausschließlich der sportlichen Dokumentation.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3">
          <Link
            href="/mein-bereich/qr-code"
            className="inline-flex h-14 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Mein Mitglieds-QR
          </Link>
          <Link
            href="/mein-bereich/einstellungen/daten"
            className="inline-flex h-14 items-center justify-center rounded-2xl border border-[#154c83] bg-white px-4 text-base font-semibold text-[#154c83] hover:bg-[#f4f9ff]"
          >
            Meine Daten bearbeiten
          </Link>
          <Link
            href="/mein-bereich/einstellungen/passwort"
            className="inline-flex h-14 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Passwort zurücksetzen
          </Link>
          <Link
            href="/mein-bereich/einstellungen"
            className="inline-flex h-14 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Alle Einstellungen
          </Link>
        </div>

        {isAdmin ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-800">
            Du bist als Admin eingeloggt.
          </div>
        ) : null}
      </div>
    </FormContainer>
  )
}
