"use client"

import { useEffect, useState } from "react"
import { useTrainerAccess } from "@/lib/useTrainerAccess"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { AiSecuritySettings, AiSecurityAnalysis, SecurityEvent, SecurityAlert, DashboardRange, TrendBucket, TopRoute, TopIp, EventTypeBreakdownEntry } from "@/lib/aiSecurity"
import type { AiNotificationState } from "@/lib/aiSecurityNotifications"
import type { ActionState } from "@/lib/aiSecurityActionsDb"
import type { BlockState, AiSecurityBlock, BlockDuration } from "@/lib/aiSecurityBlocksDb"

// ─────────────────────────────────────────────
// Typen
// ─────────────────────────────────────────────

type Overview = {
  settings: AiSecuritySettings
  analysis: AiSecurityAnalysis
  alerts: SecurityAlert[]
  events: SecurityEvent[]
  notificationState?: AiNotificationState
  range: DashboardRange
  trendBuckets: TrendBucket[]
  topRoutes: TopRoute[]
  topIps: TopIp[]
  alertHistory: SecurityAlert[]
  eventTypeBreakdown: EventTypeBreakdownEntry[]
  actionStates?: Record<string, ActionState>
  blockStates?: Record<string, BlockState>
  activeBlocks?: AiSecurityBlock[]
}

type ActionSaveState = "idle" | "saving" | "done" | "error"

// ─── Analytics-Typen ──────────────────────────────────────────────────────────

type GroupStat = { group: string; count7d: number; count30d: number }
type MemberRef = { id: string; name: string; group: string }
type TopMember = MemberRef & { count: number }
type DecliningMember = MemberRef & { prev: number; now: number }
type PeakHour = { label: string; count: number }

type KiAnalytics = {
  todayDate: string
  todayCheckins: number
  todaySessions: { id: string; group: string; start: string; end: string; title: string }[]
  pendingCount: number
  newTrialCount: number
  totalMembers: number
  groupStats: GroupStat[]
  topMembers: TopMember[]
  silentMembers14d: MemberRef[]
  silentMembers30d: MemberRef[]
  decliningMembers: DecliningMember[]
  peakHours: PeakHour[]
  summary: string
  topGroup7d: { group: string; count7d: number } | null
  topGroup30d: { group: string; count30d: number } | null
  weakGroup30d: { group: string; count30d: number } | null
  nextSession: { id: string; group: string; start: string; end: string; title: string } | null
}

const SEARCH_HINTS = [
  { label: "ohne freigabe", desc: "Pending-Anmeldungen" },
  { label: "nicht eingecheckt", desc: "14 Tage inaktiv" },
  { label: "rückgang", desc: "abnehmende Aktivität" },
  { label: "gruppe", desc: "Gruppen-Besuch" },
  { label: "stoßzeit", desc: "Stoßzeiten" },
  { label: "einheiten heute", desc: "Heutige Einheiten" },
  { label: "übersicht", desc: "Tages-Zusammenfassung" },
  { label: "probe", desc: "Probetraining" },
  { label: "meiste checkins", desc: "Top-Mitglieder" },
] as const

type SaveState = "idle" | "saving" | "success" | "error"

const DEFAULT_SETTINGS: AiSecuritySettings = {
  ai_enabled: false,
  brute_force_detection_enabled: false,
  auto_block_suspicious_ips: false,
  admin_alerts_enabled: false,
  updated_at: null,
}

// ─────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────

function riskColor(risk: AiSecurityAnalysis["overallRisk"]) {
  if (risk === "kritisch") return "text-red-600"
  if (risk === "erhöht") return "text-amber-600"
  return "text-emerald-600"
}

function riskDot(risk: AiSecurityAnalysis["overallRisk"]) {
  if (risk === "kritisch") return "bg-red-500"
  if (risk === "erhöht") return "bg-amber-400"
  return "bg-emerald-500"
}

function severityBadge(severity: SecurityEvent["severity"]) {
  if (severity === "high")
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">hoch</span>
  if (severity === "medium")
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">mittel</span>
  return <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">niedrig</span>
}

function formatEventTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function formatBlockExpiry(iso: string | null) {
  if (!iso) return "dauerhaft"
  try {
    return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso
  }
}

function friendlyEventType(type: string) {
  const map: Record<string, string> = {
    login_failure: "Login fehlgeschlagen",
    login_lock: "Login gesperrt",
    rate_limit: "Rate-Limit",
    auth_denied: "Zugriff verweigert",
    suspicious_request: "Verdächtiger Request",
    admin_security_action: "Admin-Sicherheitsaktion",
    api_error_security_relevant: "Sicherheitsrelevanter API-Fehler",
    api_error: "API-Fehler",
    manual_block_hit: "Manuelle Sperre ausgelöst",
    member_deleted: "Mitglied gelöscht",
    member_approved: "Mitglied freigegeben",
    member_parent_unlinked: "Elternkonto getrennt",
    member_group_changed: "Gruppe geändert",
    member_competition_changed: "Wettkampf geändert",
    member_trainer_assist_changed: "Trainerhilfe geändert",
    member_profile_saved: "Profil gespeichert",
  }
  return map[type] ?? type
}

// ─────────────────────────────────────────────
// Hauptkomponente
// ─────────────────────────────────────────────

export default function KiPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()

  const [loadingSettings, setLoadingSettings] = useState(true)
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [activeRange, setActiveRange] = useState<DashboardRange>("24h")

  const [settings, setSettings] = useState<AiSecuritySettings>(DEFAULT_SETTINGS)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [blockDialogTarget, setBlockDialogTarget] = useState<{ type: "ip" | "route"; key: string } | null>(null)

  const [analytics, setAnalytics] = useState<KiAnalytics | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  // Analytics laden
  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoadingAnalytics(false)
      return
    }
    ;(async () => {
      try {
        const res = await fetch("/api/admin/ki-analytics", { cache: "no-store" })
        if (res.ok) setAnalytics(await res.json())
      } catch {
        // nichts – leerer Zustand ist ok
      } finally {
        setLoadingAnalytics(false)
      }
    })()
  }, [authResolved, trainerRole])

  // KI-Settings laden
  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoadingSettings(false)
      return
    }
    ;(async () => {
      try {
        const res = await fetch("/api/admin/ai-settings", { cache: "no-store" })
        if (!res.ok) throw new Error(await res.text())
        setSettings(await res.json())
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Laden fehlgeschlagen")
      } finally {
        setLoadingSettings(false)
      }
    })()
  }, [authResolved, trainerRole])

  // Sicherheitsübersicht laden (bei Range-Wechsel neu laden)
  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoadingOverview(false)
      return
    }
    setLoadingOverview(true)
    setOverviewError(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/ai-security-overview?range=${activeRange}`, { cache: "no-store" })
        if (!res.ok) throw new Error(await res.text())
        setOverview(await res.json())
      } catch (err) {
        setOverviewError(err instanceof Error ? err.message : "Übersicht fehlgeschlagen")
      } finally {
        setLoadingOverview(false)
      }
    })()
  }, [authResolved, trainerRole, activeRange])

  async function handleSave() {
    setSaveState("saving")
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_enabled: settings.ai_enabled,
          brute_force_detection_enabled: settings.brute_force_detection_enabled,
          auto_block_suspicious_ips: settings.auto_block_suspicious_ips,
          admin_alerts_enabled: settings.admin_alerts_enabled,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSettings(await res.json())
      setSaveState("success")
      setTimeout(() => setSaveState("idle"), 3000)
    } catch {
      setSaveState("error")
      setTimeout(() => setSaveState("idle"), 4000)
    }
  }

  function toggle(key: keyof Omit<AiSecuritySettings, "updated_at">) {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
    setSaveState("idle")
  }

  async function handleBlock(
    targetType: "ip" | "route",
    targetKey: string,
    duration: BlockDuration,
    reason: string,
    note?: string
  ) {
    try {
      const res = await fetch("/api/admin/ai-security-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "block", target_type: targetType, target_key: targetKey, duration, block_reason: reason, note: note ?? null }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.block) {
        setOverview((prev) => {
          if (!prev) return prev
          const newBlockStates = { ...(prev.blockStates ?? {}) }
          newBlockStates[targetKey] = {
            blocked: true,
            blockId: data.block.id,
            blockedUntil: data.block.expires_at ?? null,
            blockReason: data.block.block_reason,
          }
          const newActiveBlocks = [data.block, ...(prev.activeBlocks ?? []).filter((b) => b.target_key !== targetKey)]
          return { ...prev, blockStates: newBlockStates, activeBlocks: newActiveBlocks }
        })
      }
    } catch {
      // ignore
    }
    setBlockDialogTarget(null)
  }

  async function handleUnblock(blockId: string, targetKey: string) {
    try {
      const res = await fetch("/api/admin/ai-security-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unblock", block_id: blockId }),
      })
      if (!res.ok) return
      setOverview((prev) => {
        if (!prev) return prev
        const newBlockStates = { ...(prev.blockStates ?? {}) }
        newBlockStates[targetKey] = { blocked: false, blockId: null, blockedUntil: null, blockReason: null }
        const newActiveBlocks = (prev.activeBlocks ?? []).filter((b) => b.id !== blockId)
        return { ...prev, blockStates: newBlockStates, activeBlocks: newActiveBlocks }
      })
    } catch {
      // ignore
    }
  }

  function handleSearch(q: string) {
    setSearchQuery(q)
  }

  function searchResults(q: string) {
    const lq = q.toLowerCase().trim()
    if (!lq || !analytics) return null
    if (lq.includes("freigabe") || lq.includes("warten") || lq.includes("pending"))
      return { type: "pending" as const }
    if (lq.includes("probe") || lq.includes("trial") || lq.includes("neu"))
      return { type: "trial" as const }
    if (
      lq.includes("nicht") || lq.includes("fehlen") || lq.includes("weg") ||
      lq.includes("inaktiv") || lq.includes("eingecheckt") || lq.includes("nicht da")
    ) return { type: "silent" as const }
    if (lq.includes("rückgang") || lq.includes("weniger") || lq.includes("abnehm"))
      return { type: "declining" as const }
    if (lq.includes("meiste") || lq.includes("beliebt") || lq.includes("top") || lq.includes("aktiv"))
      return { type: "top" as const }
    if (lq.includes("stoß") || lq.includes("stoss") || lq.includes("peak") || lq.includes("uhrzeit") || lq.includes("zeiten"))
      return { type: "peaks" as const }
    if (lq.includes("gruppe") || lq.includes("besuch") || lq.includes("auslastung"))
      return { type: "groups" as const }
    if (lq.includes("einheit") || lq.includes("session") || lq.includes("heute"))
      return { type: "sessions" as const }
    if (lq.includes("übersicht") || lq.includes("gesamt") || lq.includes("status"))
      return { type: "overview" as const }
    return { type: "none" as const }
  }

  async function handleSecurityAction(
    targetType: "alert" | "ip" | "route",
    targetKey: string,
    actionType: "acknowledged" | "muted" | "watchlist",
    note?: string
  ): Promise<ActionSaveState> {
    try {
      const res = await fetch("/api/admin/ai-security-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: targetType, target_key: targetKey, action_type: actionType, note: note ?? null }),
      })
      if (!res.ok) return "error"
      // Overview neu laden damit action states aktualisiert sind
      setOverview((prev) => {
        if (!prev) return prev
        const current = prev.actionStates ?? {}
        const existing = current[targetKey] ?? { acknowledged: false, muted: false, watchlisted: false, hasNote: false, notePreview: null }
        return {
          ...prev,
          actionStates: {
            ...current,
            [targetKey]: {
              ...existing,
              acknowledged: actionType === "acknowledged" ? true : existing.acknowledged,
              muted: actionType === "muted" ? true : existing.muted,
              watchlisted: actionType === "watchlist" ? true : existing.watchlisted,
              hasNote: note ? true : existing.hasNote,
              notePreview: note ? note.slice(0, 80) : existing.notePreview,
            },
          },
        }
      })
      return "done"
    } catch {
      return "error"
    }
  }

  if (!authResolved || loadingSettings) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
        Wird geladen…
      </div>
    )
  }

  if (trainerRole !== "admin") {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">
        Kein Zugriff.
      </div>
    )
  }

  const analysis = overview?.analysis ?? null
  const alerts = (overview?.alerts ?? []).filter((a) => a.isActive)
  const events = overview?.events ?? []
  const notificationState = overview?.notificationState ?? null
  const trendBuckets = overview?.trendBuckets ?? []
  const topRoutes = overview?.topRoutes ?? []
  const topIps = overview?.topIps ?? []
  const alertHistory = overview?.alertHistory ?? []
  const eventTypeBreakdown = overview?.eventTypeBreakdown ?? []
  const actionStates = overview?.actionStates ?? {}
  const blockStates = overview?.blockStates ?? {}
  const activeBlocks = overview?.activeBlocks ?? []

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#0f4f8c]">KI Einstellungen</h2>
        <p className="mt-1 text-sm text-zinc-500">
          KI-gestützte Sicherheits- und Analysefunktionen für den Adminbereich.
        </p>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          Fehler beim Laden der Einstellungen: {loadError}
        </div>
      )}

      {/* Aktive Warnungsleiste */}
      {!loadingOverview && alerts.length > 0 && (
        <AlertBanner alerts={alerts} />
      )}

      {/* ── Tages-Übersicht ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-800">Tages-Übersicht</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAnalytics ? (
            <p className="text-sm text-zinc-400">Wird geladen…</p>
          ) : analytics ? (
            <>
              {/* Lagezeile */}
              {(() => {
                const total = analytics.pendingCount + analytics.newTrialCount
                if (total > 0) {
                  const parts: string[] = []
                  if (analytics.pendingCount > 0) parts.push(`${analytics.pendingCount} Anmeldung${analytics.pendingCount !== 1 ? "en" : ""}`)
                  if (analytics.newTrialCount > 0) parts.push(`${analytics.newTrialCount} Probetraining${analytics.newTrialCount !== 1 ? "s" : ""}`)
                  return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                      Freigaben offen: {parts.join(" · ")}.{" "}
                      <a href="/verwaltung/freigaben" className="font-semibold underline hover:no-underline">Jetzt prüfen →</a>
                    </div>
                  )
                }
                if (analytics.todayCheckins > 0) {
                  const n = analytics.todaySessions.length
                  return (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-700">
                      Heute {analytics.todayCheckins} Check-in{analytics.todayCheckins !== 1 ? "s" : ""} in {n} Einheit{n !== 1 ? "en" : ""}.
                    </div>
                  )
                }
                return (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-400">
                    Heute noch keine Check-ins vorhanden.
                  </div>
                )
              })()}

              {/* KI-Zusammenfassung */}
              {analytics.summary && (
                <div className="rounded-xl border border-[#b9cde2] bg-[#f4f9ff] px-4 py-3 text-xs text-[#154c83]">
                  {analytics.summary}
                </div>
              )}

              {/* Kennzahlen */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KennzahlBox label="Heute Check-ins" value={String(analytics.todayCheckins)} />
                <KennzahlBox label="Einheiten heute" value={String(analytics.todaySessions.length)} />
                <KennzahlBox label="Mitglieder gesamt" value={String(analytics.totalMembers)} />
                <KennzahlBox
                  label="Offene Freigaben"
                  value={String(analytics.pendingCount + analytics.newTrialCount)}
                  highlight={analytics.pendingCount + analytics.newTrialCount > 0 ? "amber" : undefined}
                />
              </div>

              {/* Mini-Gruppen-Highlights + Nächste Einheit */}
              {(analytics.topGroup7d ?? analytics.topGroup30d ?? analytics.weakGroup30d ?? analytics.nextSession !== undefined) && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Stärkste Gruppe 7 Tage</div>
                    {analytics.topGroup7d ? (
                      <>
                        <div className="mt-0.5 truncate text-xs font-medium text-zinc-800">{analytics.topGroup7d.group}</div>
                        <div className="text-[11px] text-zinc-400">{analytics.topGroup7d.count7d} Check-ins</div>
                      </>
                    ) : (
                      <div className="mt-0.5 text-[11px] text-zinc-400">Keine Daten</div>
                    )}
                  </div>
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Stärkste Gruppe 30 Tage</div>
                    {analytics.topGroup30d ? (
                      <>
                        <div className="mt-0.5 truncate text-xs font-medium text-zinc-800">{analytics.topGroup30d.group}</div>
                        <div className="text-[11px] text-zinc-400">{analytics.topGroup30d.count30d} Check-ins</div>
                      </>
                    ) : (
                      <div className="mt-0.5 text-[11px] text-zinc-400">Keine Daten</div>
                    )}
                  </div>
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Schwächste Gruppe 30 Tage</div>
                    {analytics.weakGroup30d ? (
                      <>
                        <div className="mt-0.5 truncate text-xs font-medium text-zinc-800">{analytics.weakGroup30d.group}</div>
                        <div className="text-[11px] text-zinc-400">{analytics.weakGroup30d.count30d} Check-ins</div>
                      </>
                    ) : (
                      <div className="mt-0.5 text-[11px] text-zinc-400">Keine Daten</div>
                    )}
                  </div>
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Nächste Einheit</div>
                    {analytics.nextSession ? (
                      <>
                        <div className="mt-0.5 truncate text-xs font-medium text-zinc-800">{analytics.nextSession.group}</div>
                        <div className="text-[11px] text-zinc-400">{analytics.nextSession.start}–{analytics.nextSession.end}</div>
                      </>
                    ) : (
                      <div className="mt-0.5 text-[11px] text-zinc-400">Heute keine weitere</div>
                    )}
                  </div>
                </div>
              )}

              {/* Heutige Sessions */}
              {analytics.todaySessions.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {analytics.todaySessions.length} Einheit{analytics.todaySessions.length !== 1 ? "en" : ""} heute
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {analytics.todaySessions.map((s) => (
                      <span key={s.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
                        <span className="font-medium">{s.group}</span>
                        <span className="ml-1.5 text-zinc-400">{s.start}–{s.end}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-400">Heute keine Einheiten vorhanden.</p>
              )}
              {/* Aktionsleiste */}
              <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                <a
                  href="/verwaltung/freigaben"
                  className={`rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
                    analytics.pendingCount + analytics.newTrialCount > 0
                      ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                  }`}
                >
                  Freigaben{analytics.pendingCount + analytics.newTrialCount > 0 ? ` (${analytics.pendingCount + analytics.newTrialCount})` : ""}
                </a>
                <a
                  href="/verwaltung/mitglieder"
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100"
                >
                  Mitglieder
                </a>
                <a
                  href="/verwaltung/checkins"
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100"
                >
                  Check-ins
                </a>
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-400">Keine Daten verfügbar.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Check-in-Auswertung ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-800">Check-in-Auswertung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAnalytics ? (
            <p className="text-sm text-zinc-400">Wird ausgewertet…</p>
          ) : analytics ? (
            <>
              {/* Gruppen-Stats */}
              {analytics.groupStats.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Gruppen-Besuch</p>
                  <div className="space-y-1.5">
                    {analytics.groupStats.slice(0, 8).map((g) => (
                      <div key={g.group} className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-700">{g.group}</span>
                        <span className="text-[11px] text-zinc-400">7T: <span className="font-semibold text-zinc-700">{g.count7d}</span></span>
                        <span className="text-[11px] text-zinc-400">30T: <span className="font-semibold text-zinc-700">{g.count30d}</span></span>
                        {g.count30d === 0 && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">schwach</span>
                        )}
                      </div>
                    ))}
                    {analytics.groupStats.length > 8 && (
                      <p className="text-[11px] text-zinc-400 px-1">+{analytics.groupStats.length - 8} weitere Gruppen</p>
                    )}
                  </div>
                </div>
              )}

              {/* Stoßzeiten */}
              {analytics.peakHours.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Stoßzeiten (30 Tage)</p>
                  <div className="space-y-1">
                    {analytics.peakHours.slice(0, 6).map((h) => {
                      const maxCount = Math.max(...analytics.peakHours.map((x) => x.count), 1)
                      return (
                        <div key={h.label} className="flex items-center gap-3">
                          <span className="w-10 shrink-0 text-[11px] font-medium text-zinc-600">{h.label} Uhr</span>
                          <div className="flex-1 overflow-hidden rounded-full bg-zinc-200" style={{ height: "5px" }}>
                            <div
                              className="h-full rounded-full bg-[#154c83] opacity-60"
                              style={{ width: `${Math.round((h.count / maxCount) * 100)}%` }}
                            />
                          </div>
                          <span className="w-7 text-right text-[11px] text-zinc-400">{h.count}×</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Stille Mitglieder */}
                <div>
                  <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${analytics.silentMembers14d.length > 0 ? "text-zinc-600" : "text-zinc-400"}`}>
                    Keine Aktivität seit 14+ Tagen ({analytics.silentMembers14d.length})
                  </p>
                  {analytics.silentMembers14d.length === 0 ? (
                    <p className="text-xs text-zinc-400">Keine Auffälligkeiten.</p>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        {analytics.silentMembers14d.slice(0, 6).map((m) => (
                          <div key={m.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5">
                            <span className="flex-1 truncate text-xs font-medium text-zinc-700">{m.name}</span>
                            <span className="text-[11px] text-zinc-400 shrink-0">{m.group}</span>
                          </div>
                        ))}
                        {analytics.silentMembers14d.length > 6 && (
                          <p className="text-[11px] text-zinc-400">+{analytics.silentMembers14d.length - 6} weitere</p>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Details in der{" "}
                        <a href="/verwaltung/mitglieder" className="text-zinc-600 underline hover:no-underline">Mitgliederverwaltung</a>{" "}
                        prüfen.
                      </p>
                    </>
                  )}
                </div>

                {/* Mitglieder mit Rückgang */}
                <div>
                  <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${analytics.decliningMembers.length > 0 ? "text-zinc-600" : "text-zinc-400"}`}>
                    Rückläufige Aktivität ({analytics.decliningMembers.length})
                  </p>
                  {analytics.decliningMembers.length === 0 ? (
                    <p className="text-xs text-zinc-400">Keine Auffälligkeiten.</p>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        {analytics.decliningMembers.slice(0, 6).map((m) => (
                          <div key={m.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5">
                            <span className="flex-1 truncate text-xs font-medium text-zinc-700">{m.name}</span>
                            <span className="text-[11px] text-zinc-400 shrink-0">{m.prev}× → {m.now}×</span>
                          </div>
                        ))}
                        {analytics.decliningMembers.length > 6 && (
                          <p className="text-[11px] text-zinc-400">+{analytics.decliningMembers.length - 6} weitere</p>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Details in der{" "}
                        <a href="/verwaltung/mitglieder" className="text-zinc-600 underline hover:no-underline">Mitgliederverwaltung</a>{" "}
                        prüfen.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-400">Keine Auswertung verfügbar.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Intelligente Suche ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-800">Schnellsuche</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="z. B. ohne freigabe, gruppe, rückgang, einheiten heute…"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#154c83]/40"
          />
          {/* Hint-Chips */}
          {!searchQuery && (
            <div className="flex flex-wrap gap-1.5">
              {SEARCH_HINTS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => handleSearch(h.label)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100"
                >
                  {h.label}
                </button>
              ))}
            </div>
          )}
          {/* Suchergebnisse */}
          {searchQuery && analytics && (() => {
            const result = searchResults(searchQuery)
            if (!result) return null
            if (result.type === "none") return <p className="text-xs text-zinc-400">Kein passendes Ergebnis für „{searchQuery}".</p>
            if (result.type === "pending") return (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">{analytics.pendingCount} Anmeldung{analytics.pendingCount !== 1 ? "en" : ""}</span> warten auf Freigabe
                {analytics.newTrialCount > 0 && `, ${analytics.newTrialCount} Probetraining`}.{" "}
                <a href="/verwaltung/freigaben" className="font-semibold underline hover:no-underline">→ Jetzt in Freigaben prüfen</a>
              </div>
            )
            if (result.type === "trial") return (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <span className="font-semibold">{analytics.newTrialCount} Probetraining-Anfrage{analytics.newTrialCount !== 1 ? "n" : ""}</span> offen.{" "}
                <a href="/verwaltung/freigaben" className="font-semibold underline hover:no-underline">→ Jetzt in Freigaben prüfen</a>
              </div>
            )
            if (result.type === "silent") return (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Keine Aktivität seit 14+ Tagen ({analytics.silentMembers14d.length})</p>
                {analytics.silentMembers14d.length === 0
                  ? <p className="text-xs text-zinc-400">Keine Auffälligkeiten.</p>
                  : <>
                    {analytics.silentMembers14d.slice(0, 6).map((m) => (
                      <div key={m.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5">
                        <span className="flex-1 truncate text-xs font-medium text-zinc-700">{m.name}</span>
                        <span className="text-[11px] text-zinc-400 shrink-0">{m.group}</span>
                      </div>
                    ))}
                    {analytics.silentMembers14d.length > 6 && (
                      <p className="text-[11px] text-zinc-400">+{analytics.silentMembers14d.length - 6} weitere</p>
                    )}
                    <p className="pt-0.5 text-[11px] text-zinc-400"><a href="/verwaltung/mitglieder" className="text-zinc-600 underline hover:no-underline">Mitgliederverwaltung</a> für Details nutzen.</p>
                  </>
                }
              </div>
            )
            if (result.type === "declining") return (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Rückläufige Aktivität ({analytics.decliningMembers.length})</p>
                {analytics.decliningMembers.length === 0
                  ? <p className="text-xs text-zinc-400">Keine Auffälligkeiten.</p>
                  : <>
                    {analytics.decliningMembers.slice(0, 6).map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5">
                        <span className="flex-1 truncate text-xs font-medium text-zinc-700">{m.name}</span>
                        <span className="text-[11px] text-zinc-500 shrink-0">{m.prev}× → {m.now}×</span>
                      </div>
                    ))}
                    {analytics.decliningMembers.length > 6 && (
                      <p className="text-[11px] text-zinc-400">+{analytics.decliningMembers.length - 6} weitere</p>
                    )}
                    <p className="pt-0.5 text-[11px] text-zinc-400"><a href="/verwaltung/mitglieder" className="text-zinc-600 underline hover:no-underline">Mitgliederverwaltung</a> für Details nutzen.</p>
                  </>
                }
              </div>
            )
            if (result.type === "top") return (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Meiste Check-ins (30 Tage)</p>
                {analytics.topMembers.length === 0
                  ? <p className="text-xs text-zinc-400">Keine Daten verfügbar.</p>
                  : <>
                    {analytics.topMembers.slice(0, 8).map((m, i) => (
                      <div key={m.id} className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5">
                        <span className="w-5 shrink-0 text-center text-[11px] font-bold text-zinc-400">{i + 1}.</span>
                        <span className="flex-1 truncate text-xs font-medium text-zinc-700">{m.name}</span>
                        <span className="text-[11px] text-zinc-400 shrink-0">{m.group}</span>
                        <span className="text-xs font-bold text-[#154c83] shrink-0">{m.count}×</span>
                      </div>
                    ))}
                    {analytics.topMembers.length > 8 && (
                      <p className="text-[11px] text-zinc-400">+{analytics.topMembers.length - 8} weitere</p>
                    )}
                  </>
                }
              </div>
            )
            if (result.type === "peaks") return (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Stoßzeiten (letzte 30 Tage)</p>
                {analytics.peakHours.length === 0
                  ? <p className="text-xs text-zinc-400">Keine Auffälligkeiten.</p>
                  : <div className="space-y-1.5">
                    {analytics.peakHours.slice(0, 8).map((h) => (
                      <div key={h.label} className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5">
                        <span className="w-10 shrink-0 text-xs font-medium text-zinc-700">{h.label} Uhr</span>
                        <div className="flex-1 overflow-hidden rounded-full bg-zinc-200" style={{ height: "6px" }}>
                          <div
                            className="h-full rounded-full bg-[#154c83] opacity-60"
                            style={{ width: `${Math.round((h.count / Math.max(...analytics.peakHours.map((x) => x.count), 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-[11px] text-zinc-500">{h.count}×</span>
                      </div>
                    ))}
                  </div>
                }
              </div>
            )
            if (result.type === "groups") return (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Gruppen-Besuch ({analytics.groupStats.length})</p>
                {analytics.groupStats.length === 0
                  ? <p className="text-xs text-zinc-400">Keine Gruppendaten vorhanden.</p>
                  : <>
                    {analytics.groupStats.slice(0, 8).map((g) => (
                      <div key={g.group} className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-700">{g.group}</span>
                        <span className="text-[11px] text-zinc-400">7T: <span className="font-semibold text-zinc-700">{g.count7d}</span></span>
                        <span className="text-[11px] text-zinc-400">30T: <span className="font-semibold text-zinc-700">{g.count30d}</span></span>
                        {g.count30d === 0 && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">schwach</span>
                        )}
                      </div>
                    ))}
                    {analytics.groupStats.length > 8 && (
                      <p className="text-[11px] text-zinc-400">+{analytics.groupStats.length - 8} weitere Gruppen</p>
                    )}
                  </>
                }
              </div>
            )
            if (result.type === "sessions") return (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {analytics.todaySessions.length === 0
                    ? "Heute keine Einheiten vorhanden"
                    : `${analytics.todaySessions.length} Einheit${analytics.todaySessions.length !== 1 ? "en" : ""} heute · ${analytics.todayCheckins} Check-in${analytics.todayCheckins !== 1 ? "s" : ""}`}
                </p>
                {analytics.todaySessions.length === 0
                  ? <p className="text-xs text-zinc-400">Heute keine Einheiten vorhanden.</p>
                  : <div className="space-y-1">
                    {analytics.todaySessions.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5">
                        <span className="flex-1 truncate text-xs font-medium text-zinc-700">{s.group}</span>
                        <span className="text-[11px] text-zinc-400 shrink-0">{s.start}–{s.end}</span>
                      </div>
                    ))}
                  </div>
                }
              </div>
            )
            if (result.type === "overview") return (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                    <div className="text-[11px] text-zinc-500">Check-ins heute</div>
                    <div className="mt-0.5 text-lg font-bold text-[#154c83]">{analytics.todayCheckins}</div>
                  </div>
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                    <div className="text-[11px] text-zinc-500">Einheiten heute</div>
                    <div className="mt-0.5 text-lg font-bold text-[#154c83]">{analytics.todaySessions.length}</div>
                  </div>
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                    <div className="text-[11px] text-zinc-500">Mitglieder gesamt</div>
                    <div className="mt-0.5 text-lg font-bold text-[#154c83]">{analytics.totalMembers}</div>
                  </div>
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                    <div className="text-[11px] text-zinc-500">Offene Freigaben</div>
                    <div className="mt-0.5 text-lg font-bold text-[#154c83]">{analytics.pendingCount}</div>
                  </div>
                </div>
                {analytics.summary ? (
                  <p className="text-xs text-zinc-500 line-clamp-2">{analytics.summary}</p>
                ) : null}
              </div>
            )
            return null
          })()}
        </CardContent>
      </Card>

      <div className="mt-4 border-t border-zinc-100 pt-5 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400/70 px-1">Sicherheit &amp; Überwachung</p>
      </div>
      {/* ── Status ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-800">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                settings.ai_enabled ? "bg-emerald-500" : "bg-zinc-300"
              }`}
            />
            <span className={`text-sm ${settings.ai_enabled ? "text-emerald-700 font-medium" : "text-zinc-500"}`}>
              {settings.ai_enabled ? "KI-System aktiv" : "KI-System inaktiv"}
            </span>
          </div>
          <div className="mt-3 space-y-1.5 pl-1">
            <StatusRow label="Brute-Force-Erkennung" active={settings.brute_force_detection_enabled} />
            <StatusRow label="Auto-IP-Sperre" active={settings.auto_block_suspicious_ips} />
            <StatusRow label="Admin-Benachrichtigung" active={settings.admin_alerts_enabled} />
          </div>
        </CardContent>
      </Card>

      {/* ── Sicherheitslage ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-800">Sicherheitslage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingOverview ? (
            <p className="text-sm text-zinc-400">Wird analysiert…</p>
          ) : overviewError ? (
            <p className="text-sm text-red-500">Fehler: {overviewError}</p>
          ) : analysis ? (
            <>
              {/* Gesamtstatus */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${riskDot(analysis.overallRisk)}`} />
                <span className={`text-sm font-semibold capitalize ${riskColor(analysis.overallRisk)}`}>
                  {analysis.overallRisk}
                </span>
              </div>

              {/* Kennzahlen */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KennzahlBox label="Ereignisse gesamt" value={String(analysis.totalEvents)} />
                <KennzahlBox label="Hohe Risiken" value={String(analysis.highCount)} highlight={analysis.highCount > 0 ? "red" : undefined} />
                <KennzahlBox label="Mittlere Risiken" value={String(analysis.mediumCount)} highlight={analysis.mediumCount > 0 ? "amber" : undefined} />
                <KennzahlBox
                  label="Letzte Auffälligkeit"
                  value={analysis.lastIncident ? formatEventTime(analysis.lastIncident) : "–"}
                />
              </div>

              {/* Auffällige Bereiche */}
              {(analysis.suspiciousRoutes.length > 0 || analysis.suspiciousIps.length > 0) && (
                <div className="space-y-2">
                  {analysis.suspiciousRoutes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                        Auffällige Routen
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.suspiciousRoutes.map((r) => (
                          <span
                            key={r}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-800"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.suspiciousIps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                        Auffällige IPs
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.suspiciousIps.map((ip) => (
                          <span
                            key={ip}
                            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-mono text-red-700"
                          >
                            {ip}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* KI-Zusammenfassung */}
              <div className="rounded-xl border border-[#b9cde2] bg-[#f4f9ff] px-4 py-3 text-xs text-[#154c83]">
                <span className="font-semibold">KI-Einschätzung: </span>
                {analysis.summaryText}
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-400">Noch keine Sicherheitsereignisse vorhanden.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Warnungen ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-800">Warnungen</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOverview ? (
            <p className="text-sm text-zinc-400">Wird analysiert…</p>
          ) : alerts.length === 0 ? (
            <p className="text-xs text-zinc-400">Aktuell keine aktiven Warnungen.</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  actionState={actionStates[alert.id]}
                  onAction={(actionType, note) => handleSecurityAction("alert", alert.id, actionType, note)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Aktive Schutzmaßnahmen ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-800">Aktive Schutzmaßnahmen</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOverview ? (
            <p className="text-sm text-zinc-400">Wird geladen…</p>
          ) : activeBlocks.length === 0 ? (
            <p className="text-xs text-zinc-400">Keine aktiven Sperren.</p>
          ) : (
            <div className="space-y-2">
              {activeBlocks.map((block) => (
                <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        block.target_type === "ip" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {block.target_type === "ip" ? "IP" : "Route"}
                      </span>
                      <span className="text-xs font-mono text-zinc-800">{block.target_key}</span>
                    </div>
                    <p className="text-[11px] text-zinc-600">{block.block_reason}</p>
                    <p className="text-[10px] text-zinc-400">
                      {block.expires_at ? `Ablauf: ${formatBlockExpiry(block.expires_at)}` : "Dauerhaft"}
                      {block.created_by && ` · von ${block.created_by}`}
                    </p>
                    {block.note && (
                      <p className="text-[10px] italic text-zinc-500">{block.note}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnblock(block.id, block.target_key)}
                    className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Freigeben
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 border-t border-zinc-100 pt-5 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400/70 px-1">Analyse &amp; Verlauf</p>
      </div>
      {/* ── Dashboard ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base text-zinc-800">Dashboard</CardTitle>
            <div className="flex gap-1.5">
              {(["24h", "7d", "30d"] as DashboardRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setActiveRange(r)}
                  className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                    activeRange === r
                      ? "bg-[#154c83] text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {r === "24h" ? "24 Std." : r === "7d" ? "7 Tage" : "30 Tage"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {loadingOverview ? (
            <p className="text-sm text-zinc-400">Wird geladen…</p>
          ) : overviewError ? (
            <p className="text-sm text-red-500">Fehler: {overviewError}</p>
          ) : (
            <>
              {/* Trend-Balken */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Ereignisverlauf
                </p>
                {trendBuckets.length === 0 || trendBuckets.every((b) => b.total === 0) ? (
                  <p className="text-xs text-zinc-400">Keine Ereignisse im Zeitraum.</p>
                ) : (
                  <TrendChart buckets={trendBuckets} />
                )}
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                {/* Top-Routen */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Top Routen
                  </p>
                  {topRoutes.length === 0 ? (
                    <p className="text-xs text-zinc-400">Keine Route-Daten.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {topRoutes.map((r) => {
                        const state = actionStates[r.route]
                        return (
                          <div key={r.route} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <span className="truncate text-xs font-mono text-zinc-700 block">{r.route}</span>
                              {state?.watchlisted && (
                                <span className="text-[10px] text-blue-600 font-medium">beobachtet</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {r.highCount > 0 && (
                                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                                  {r.highCount}×hoch
                                </span>
                              )}
                              <span className="text-xs font-bold text-zinc-500">{r.count}</span>
                              {!state?.watchlisted && (
                                <WatchButton
                                  onClick={() => handleSecurityAction("route", r.route, "watchlist")}
                                />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Top-IPs */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Top IPs (anonymisiert)
                  </p>
                  {topIps.length === 0 ? (
                    <p className="text-xs text-zinc-400">Keine IP-Daten.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {topIps.map((ip) => {
                        const state = actionStates[ip.ip]
                        const block = blockStates[ip.ip]
                        return (
                          <div key={ip.ip} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${block?.blocked ? "border-red-200 bg-red-50" : "border-zinc-100 bg-zinc-50"}`}>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-mono text-zinc-700">{ip.ip}</span>
                              {state?.watchlisted && (
                                <span className="ml-2 text-[10px] text-blue-600 font-medium">beobachtet</span>
                              )}
                              {block?.blocked && (
                                <span className="ml-2 text-[10px] text-red-600 font-medium">
                                  gesperrt{block.blockedUntil ? ` bis ${formatBlockExpiry(block.blockedUntil)}` : " (dauerhaft)"}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {ip.highCount > 0 && (
                                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                                  {ip.highCount}×hoch
                                </span>
                              )}
                              <span className="text-xs font-bold text-zinc-500">{ip.count}</span>
                              {!state?.watchlisted && (
                                <WatchButton
                                  onClick={() => handleSecurityAction("ip", ip.ip, "watchlist")}
                                />
                              )}
                              {block?.blocked && block.blockId ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnblock(block.blockId!, ip.ip)}
                                  className="rounded-md border border-red-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
                                >
                                  Freigeben
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setBlockDialogTarget({ type: "ip", key: ip.ip })}
                                  className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50"
                                >
                                  Sperren
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Eventtypen */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Ereignistypen
                </p>
                {eventTypeBreakdown.length === 0 ? (
                  <p className="text-xs text-zinc-400">Keine Ereignisse.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {eventTypeBreakdown.map((entry) => (
                      <div
                        key={entry.type}
                        className="flex items-center gap-1.5 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5"
                      >
                        <span className="text-xs text-zinc-600">{friendlyEventType(entry.type)}</span>
                        <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-bold text-zinc-700">
                          {entry.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Alert-Historie */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Alert-Verlauf
                </p>
                {alertHistory.length === 0 ? (
                  <p className="text-xs text-zinc-400">Keine Alerts im Zeitraum.</p>
                ) : (
                  <div className="space-y-2">
                    {alertHistory.map((a) => (
                      <div
                        key={a.id}
                        className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                          a.level === "critical"
                            ? "border-red-200 bg-red-50"
                            : a.level === "warning"
                            ? "border-amber-200 bg-amber-50"
                            : "border-zinc-200 bg-zinc-50"
                        }`}
                      >
                        <span
                          className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            a.level === "critical"
                              ? "bg-red-500 text-white"
                              : a.level === "warning"
                              ? "bg-amber-400 text-white"
                              : "bg-zinc-400 text-white"
                          }`}
                        >
                          {a.level}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-zinc-700">{a.title}</p>
                          {a.relatedRoute && (
                            <p className="text-[11px] text-zinc-400 font-mono truncate">{a.relatedRoute}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] text-zinc-400">
                          {formatEventTime(a.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Letzte Ereignisse ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-800">Letzte Ereignisse</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOverview ? (
            <p className="text-sm text-zinc-400">Wird geladen…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-zinc-400">Noch keine Ereignisse aufgezeichnet.</p>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full min-w-[500px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-400">
                    <th className="px-2 py-2">Zeitpunkt</th>
                    <th className="px-2 py-2">Typ</th>
                    <th className="px-2 py-2 hidden sm:table-cell">Route / Akteur</th>
                    <th className="px-2 py-2">Risiko</th>
                    <th className="px-2 py-2 hidden md:table-cell">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 20).map((e) => (
                    <tr key={e.id} className="border-b border-zinc-50 hover:bg-zinc-50/60">
                      <td className="px-2 py-2 text-xs text-zinc-500 whitespace-nowrap">
                        {formatEventTime(e.created_at)}
                      </td>
                      <td className="px-2 py-2 text-xs text-zinc-700 whitespace-nowrap">
                        {friendlyEventType(e.type)}
                      </td>
                      <td className="px-2 py-2 text-xs text-zinc-500 hidden sm:table-cell max-w-[140px] truncate">
                        {e.route ?? e.actor ?? "–"}
                      </td>
                      <td className="px-2 py-2">{severityBadge(e.severity)}</td>
                      <td className="px-2 py-2 text-xs text-zinc-400 hidden md:table-cell max-w-[180px] truncate">
                        {e.detail ?? "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Benachrichtigungen ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-800">Benachrichtigungen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                settings.admin_alerts_enabled && settings.ai_enabled ? "bg-emerald-500" : "bg-zinc-300"
              }`}
            />
            <span className="text-xs text-zinc-600">
              Mailversand:{" "}
              <span
                className={
                  settings.admin_alerts_enabled && settings.ai_enabled
                    ? "font-medium text-emerald-700"
                    : "text-zinc-400"
                }
              >
                {settings.admin_alerts_enabled && settings.ai_enabled ? "aktiv" : "inaktiv"}
              </span>
            </span>
          </div>
          {notificationState?.last_sent_at ? (
            <div className="text-xs text-zinc-500">
              <span className="font-medium text-zinc-600">Letzter Versand:</span>{" "}
              {new Date(notificationState.last_sent_at).toLocaleString("de-DE")}
            </div>
          ) : (
            <p className="text-xs text-zinc-400">Noch keine Benachrichtigung versandt.</p>
          )}
          {notificationState?.last_subject && (
            <div className="text-xs text-zinc-500">
              <span className="font-medium text-zinc-600">Betreff:</span>{" "}
              {notificationState.last_subject}
            </div>
          )}
          <p className="text-xs text-zinc-400">
            Cooldown: 30 Minuten – gleiche kritische Warnung wird in diesem Zeitraum nicht erneut versandt.
          </p>
        </CardContent>
      </Card>

      <div className="mt-4 border-t border-zinc-100 pt-5 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400/70 px-1">System &amp; Konfiguration</p>
      </div>
      {/* ── Monitoring ── */}
      <Card className="border-dashed bg-zinc-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-400">Monitoring</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 pt-0">
          <p className="text-xs text-zinc-400">
            Login-, API- und Sicherheitsereignisse werden hier künftig analysiert.
          </p>
        </CardContent>
      </Card>

      {/* ── Sicherheitsoptionen ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-800">Sicherheitsoptionen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="KI-System aktivieren"
            value={settings.ai_enabled}
            onChange={() => toggle("ai_enabled")}
          />
          <ToggleRow
            label="Brute-Force-Erkennung aktivieren"
            value={settings.brute_force_detection_enabled}
            onChange={() => toggle("brute_force_detection_enabled")}
          />
          <ToggleRow
            label="Verdächtige IPs automatisch sperren"
            value={settings.auto_block_suspicious_ips}
            onChange={() => toggle("auto_block_suspicious_ips")}
          />
          <ToggleRow
            label="Admin bei Auffälligkeiten benachrichtigen"
            value={settings.admin_alerts_enabled}
            onChange={() => toggle("admin_alerts_enabled")}
          />
        </CardContent>
      </Card>

      {/* ── Speichern ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="rounded-2xl bg-[#154c83] px-6 text-white hover:bg-[#123d69] disabled:opacity-60"
        >
          {saveState === "saving" ? "Wird gespeichert…" : "Einstellungen speichern"}
        </Button>
        {saveState === "success" && (
          <span className="text-sm font-medium text-emerald-600">Gespeichert.</span>
        )}
        {saveState === "error" && (
          <span className="text-sm font-medium text-red-600">Fehler beim Speichern.</span>
        )}
        {settings.updated_at && saveState === "idle" && (
          <span className="text-xs text-zinc-400">
            Zuletzt gespeichert: {new Date(settings.updated_at).toLocaleString("de-DE")}
          </span>
        )}
      </div>

      {/* ── Hinweisbox ── */}
      <div className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-5 py-4 text-xs text-[#154c83]">
        Einige dieser Funktionen sind noch in Vorbereitung und werden schrittweise aktiviert.
      </div>

      {/* ── Block-Dialog ── */}
      {blockDialogTarget && (
        <BlockDialog
          target={blockDialogTarget}
          onBlock={handleBlock}
          onClose={() => setBlockDialogTarget(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Teilkomponenten
// ─────────────────────────────────────────────

function StatusRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <span className={`inline-flex h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-zinc-300"}`} />
      {label}:{" "}
      <span className={active ? "text-emerald-600 font-medium" : ""}>{active ? "aktiv" : "inaktiv"}</span>
    </div>
  )
}

function KennzahlBox({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: "red" | "amber"
}) {
  const valueClass =
    highlight === "red"
      ? "text-red-600"
      : highlight === "amber"
      ? "text-amber-600"
      : "text-zinc-800"
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
      <p className={`text-lg font-bold ${valueClass}`}>{value}</p>
      <p className="text-[11px] text-zinc-400 leading-tight mt-0.5">{label}</p>
    </div>
  )
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-zinc-700">{label}</span>
      <button
        type="button"
        onClick={onChange}
        role="switch"
        aria-checked={value}
        aria-label={label}
        className={`relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#154c83] ${
          value ? "bg-[#154c83]" : "bg-zinc-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  )
}

function AlertBanner({ alerts }: { alerts: SecurityAlert[] }) {
  const criticalCount = alerts.filter((a) => a.level === "critical").length
  const warningCount = alerts.filter((a) => a.level === "warning").length
  const hasCritical = criticalCount > 0
  return (
    <div
      className={`rounded-2xl border px-5 py-3 text-sm font-medium ${
        hasCritical
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {alerts.length} aktive Warnung{alerts.length !== 1 ? "en" : ""}
      {criticalCount > 0 && `, davon ${criticalCount} kritisch`}
      {warningCount > 0 && criticalCount === 0 && `, davon ${warningCount} erhöht`}
      {" – Sicherheitsbereich prüfen."}
    </div>
  )
}

function AlertCard({
  alert,
  actionState,
  onAction,
}: {
  alert: SecurityAlert
  actionState?: ActionState
  onAction?: (actionType: "acknowledged" | "muted" | "watchlist", note?: string) => Promise<ActionSaveState>
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState(actionState?.notePreview ?? "")
  const [localState, setLocalState] = useState<ActionState>(
    actionState ?? { acknowledged: false, muted: false, watchlisted: false, hasNote: false, notePreview: null }
  )

  async function act(actionType: "acknowledged" | "muted" | "watchlist") {
    if (!onAction || saving) return
    setSaving(actionType)
    const result = await onAction(actionType)
    if (result === "done") {
      setLocalState((prev) => ({
        ...prev,
        acknowledged: actionType === "acknowledged" ? true : prev.acknowledged,
        muted: actionType === "muted" ? true : prev.muted,
        watchlisted: actionType === "watchlist" ? true : prev.watchlisted,
      }))
    }
    setSaving(null)
  }

  async function saveNote() {
    if (!onAction || !noteText.trim()) return
    setSaving("note")
    const result = await onAction("acknowledged", noteText.trim())
    if (result === "done") {
      setLocalState((prev) => ({ ...prev, hasNote: true, notePreview: noteText.trim().slice(0, 80) }))
      setNoteOpen(false)
    }
    setSaving(null)
  }

  const styles = {
    critical: {
      border: "border-red-200",
      bg: localState.muted ? "bg-zinc-50" : "bg-red-50",
      badge: "bg-red-100 text-red-700",
      badgeLabel: "Kritisch",
    },
    warning: {
      border: "border-amber-200",
      bg: localState.muted ? "bg-zinc-50" : "bg-amber-50",
      badge: "bg-amber-100 text-amber-700",
      badgeLabel: "Warnung",
    },
    info: {
      border: "border-blue-200",
      bg: localState.muted ? "bg-zinc-50" : "bg-blue-50",
      badge: "bg-blue-100 text-blue-700",
      badgeLabel: "Hinweis",
    },
  }
  const s = styles[alert.level]
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} px-4 py-3 transition-colors`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.badge}`}>
            {s.badgeLabel}
          </span>
          <span className={`text-sm font-semibold ${localState.muted ? "text-zinc-400 line-through" : "text-zinc-800"}`}>
            {alert.title}
          </span>
          {localState.acknowledged && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">geprüft</span>
          )}
          {localState.muted && (
            <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">stumm</span>
          )}
          {localState.watchlisted && (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">beobachtet</span>
          )}
          {localState.hasNote && (
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">Notiz</span>
          )}
        </div>
        <span className="text-xs text-zinc-400 whitespace-nowrap">
          {formatEventTime(alert.created_at)}
        </span>
      </div>
      {!localState.muted && <p className="mt-1.5 text-sm text-zinc-600">{alert.message}</p>}
      {(alert.relatedRoute ?? alert.relatedIp) && !localState.muted && (
        <div className="mt-2 flex flex-wrap gap-2">
          {alert.relatedRoute && (
            <span className="rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-500">
              Route: {alert.relatedRoute}
            </span>
          )}
          {alert.relatedIp && (
            <span className="rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-xs font-mono text-zinc-500">
              IP: {alert.relatedIp}
            </span>
          )}
        </div>
      )}
      {/* Action-Buttons */}
      {onAction && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!localState.acknowledged && (
            <button
              type="button"
              onClick={() => act("acknowledged")}
              disabled={!!saving}
              className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              {saving === "acknowledged" ? "…" : "✓ Geprüft"}
            </button>
          )}
          {!localState.muted && (
            <button
              type="button"
              onClick={() => act("muted")}
              disabled={!!saving}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              {saving === "muted" ? "…" : "Stummschalten"}
            </button>
          )}
          {!localState.watchlisted && (
            <button
              type="button"
              onClick={() => act("watchlist")}
              disabled={!!saving}
              className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              {saving === "watchlist" ? "…" : "Beobachten"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className="rounded-lg border border-zinc-100 bg-white px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
          >
            {noteOpen ? "Notiz schließen" : (localState.hasNote ? "Notiz bearbeiten" : "Notiz")}
          </button>
        </div>
      )}
      {noteOpen && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Interne Notiz (max. 500 Zeichen)…"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#154c83]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveNote}
              disabled={!!saving || !noteText.trim()}
              className="rounded-lg bg-[#154c83] px-3 py-1 text-xs font-medium text-white hover:bg-[#123d69] disabled:opacity-50"
            >
              {saving === "note" ? "…" : "Speichern"}
            </button>
            <button
              type="button"
              onClick={() => setNoteOpen(false)}
              className="rounded-lg border border-zinc-200 px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function WatchButton({ onClick }: { onClick: () => Promise<ActionSaveState> | void }) {
  const [state, setState] = useState<"idle" | "saving" | "done">("idle")
  return (
    <button
      type="button"
      disabled={state !== "idle"}
      onClick={async () => {
        setState("saving")
        await onClick()
        setState("done")
      }}
      className="rounded-md border border-blue-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
    >
      {state === "done" ? "✓" : state === "saving" ? "…" : "Beobachten"}
    </button>
  )
}

function TrendChart({ buckets }: { buckets: TrendBucket[] }) {
  const maxTotal = Math.max(...buckets.map((b) => b.total), 1)
  // Zeige nur jeden n-ten Label um Überfüllung zu vermeiden
  const showEvery = buckets.length > 12 ? Math.ceil(buckets.length / 12) : 1
  return (
    <div className="w-full">
      <div className="flex items-end gap-[2px] h-20">
        {buckets.map((bucket, i) => {
          const heightPct = Math.max((bucket.total / maxTotal) * 100, bucket.total > 0 ? 4 : 0)
          const hasHigh = bucket.high > 0
          const hasMedium = bucket.medium > 0
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-0.5" title={`${bucket.label}: ${bucket.total} Ereignisse (hoch: ${bucket.high}, mittel: ${bucket.medium})`}>
              <div className="w-full flex flex-col justify-end" style={{ height: "72px" }}>
                <div
                  className={`w-full rounded-t-sm transition-all ${
                    hasHigh ? "bg-red-400" : hasMedium ? "bg-amber-400" : "bg-[#b9cde2]"
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {/* X-Achse Labels */}
      <div className="flex items-start gap-[2px] mt-1">
        {buckets.map((bucket, i) => (
          <div key={i} className="flex-1 text-center">
            {i % showEvery === 0 ? (
              <span className="text-[9px] text-zinc-400 leading-none">{bucket.label}</span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3">
        <span className="flex items-center gap-1 text-[11px] text-zinc-400">
          <span className="inline-block h-2 w-2 rounded-sm bg-red-400" /> Hoch
        </span>
        <span className="flex items-center gap-1 text-[11px] text-zinc-400">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" /> Mittel
        </span>
        <span className="flex items-center gap-1 text-[11px] text-zinc-400">
          <span className="inline-block h-2 w-2 rounded-sm bg-[#b9cde2]" /> Niedrig
        </span>
      </div>
    </div>
  )
}

const BLOCK_DURATION_LABELS: Record<BlockDuration, string> = {
  "15m": "15 Minuten",
  "1h": "1 Stunde",
  "24h": "24 Stunden",
  permanent: "Dauerhaft",
}

const BLOCK_REASONS_LIST = [
  "Brute-Force-Versuch",
  "Ungewöhnliche Anfragemuster",
  "Mehrfache Sicherheitsverletzungen",
  "Verdächtige IP-Aktivität",
  "Rate-Limit überschritten",
  "Manuell gesperrt",
  "Sonstiger Grund",
]

function BlockDialog({
  target,
  onBlock,
  onClose,
}: {
  target: { type: "ip" | "route"; key: string }
  onBlock: (targetType: "ip" | "route", targetKey: string, duration: BlockDuration, reason: string, note?: string) => Promise<void>
  onClose: () => void
}) {
  const [duration, setDuration] = useState<BlockDuration>("1h")
  const [reason, setReason] = useState(BLOCK_REASONS_LIST[0])
  const [customReason, setCustomReason] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const effectiveReason = reason === "Sonstiger Grund" ? customReason.trim() : reason

  async function handleSubmit() {
    if (!effectiveReason) return
    setSaving(true)
    await onBlock(target.type, target.key, duration, effectiveReason, note.trim() || undefined)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-zinc-800">
            {target.type === "ip" ? "IP sperren" : "Route sperren"}
          </h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Ziel</p>
            <p className="text-xs font-mono text-zinc-700 break-all">{target.key}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">Sperrdauer</p>
            <div className="flex flex-wrap gap-1.5">
              {(["15m", "1h", "24h", "permanent"] as BlockDuration[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                    duration === d ? "bg-[#154c83] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {BLOCK_DURATION_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">Grund</p>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 focus:outline-none focus:ring-1 focus:ring-[#154c83]"
            >
              {BLOCK_REASONS_LIST.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {reason === "Sonstiger Grund" && (
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                maxLength={200}
                placeholder="Grund eingeben…"
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 focus:outline-none focus:ring-1 focus:ring-[#154c83]"
              />
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Notiz (optional)</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Interne Notiz…"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#154c83]"
            />
          </div>
        </div>
        <div className="flex gap-2 border-t border-zinc-100 px-5 py-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !effectiveReason}
            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Wird gesperrt…" : "Sperre aktivieren"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-xs text-zinc-600 hover:bg-zinc-50"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}
