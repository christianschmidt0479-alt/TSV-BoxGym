"use client"

import { useEffect, useState } from "react"
import { useTrainerAccess } from "@/lib/useTrainerAccess"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { AiSecuritySettings } from "@/lib/aiSecurity"
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

// ─────────────────────────────────────────────
// Hauptkomponente
// ─────────────────────────────────────────────

export default function KiPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()

  const [loadingSettings, setLoadingSettings] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [settings, setSettings] = useState<AiSecuritySettings>(DEFAULT_SETTINGS)
  const [saveState, setSaveState] = useState<SaveState>("idle")

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

  // Sicherheitsübersicht → jetzt in /verwaltung/sicherheit

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
