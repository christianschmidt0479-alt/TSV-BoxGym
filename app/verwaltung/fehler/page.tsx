"use client"

import { useEffect, useState, useCallback } from "react"
import { useTrainerAccess } from "@/lib/useTrainerAccess"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatDisplayDateTime } from "@/lib/dateFormat"
import type { AppErrorRecord, AppErrorSummary, AppErrorSeverity, AppErrorStatus } from "@/lib/appErrorsDb"
import { getSeverityLabel, getStatusLabel } from "@/lib/appErrorAnalysis"
import { useMarkSectionSeen } from "@/lib/useMarkSectionSeen"

// ─── Typen ────────────────────────────────────────────────────────────────────

type Range = "24h" | "7d" | "30d"

type OverviewResponse = {
  errors: AppErrorRecord[]
  overview: AppErrorSummary
  summaryText: string
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function severityColor(severity: AppErrorSeverity) {
  switch (severity) {
    case "critical": return "bg-red-100 text-red-800 border-red-300"
    case "high":     return "bg-orange-100 text-orange-800 border-orange-300"
    case "medium":   return "bg-yellow-100 text-yellow-800 border-yellow-300"
    case "low":      return "bg-zinc-100 text-zinc-700 border-zinc-300"
  }
}

function statusColor(status: AppErrorStatus) {
  switch (status) {
    case "open":         return "text-red-700"
    case "acknowledged": return "text-amber-700"
    case "resolved":     return "text-green-700"
    case "ignored":      return "text-zinc-500"
  }
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function FehlerPage() {
  useMarkSectionSeen("errors")
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()

  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<AppErrorRecord[]>([])
  const [overview, setOverview] = useState<AppErrorSummary | null>(null)
  const [summaryText, setSummaryText] = useState("")
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Filter
  const [range, setRange] = useState<Range>("7d")
  const [filterStatus, setFilterStatus] = useState<AppErrorStatus | "">("")
  const [filterSeverity, setFilterSeverity] = useState<AppErrorSeverity | "">("")
  const [filterQ, setFilterQ] = useState("")

  // Detail-Ansicht
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams({ range })
      if (filterStatus) params.set("status", filterStatus)
      if (filterSeverity) params.set("severity", filterSeverity)
      if (filterQ.trim()) params.set("q", filterQ.trim())

      const response = await fetch(`/api/admin/app-errors?${params.toString()}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await response.text())

      const data = (await response.json()) as OverviewResponse
      setErrors(data.errors ?? [])
      setOverview(data.overview ?? null)
      setSummaryText(data.summaryText ?? "")
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Ladefehler")
    } finally {
      setLoading(false)
    }
  }, [authResolved, trainerRole, range, filterStatus, filterSeverity, filterQ])

  useEffect(() => { void load() }, [load])

  async function handleStatusUpdate(id: string, status: AppErrorStatus, note?: string) {
    setSaving(true)
    try {
      const response = await fetch("/api/admin/app-errors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, note }),
      })
      if (!response.ok) throw new Error(await response.text())
      setSelectedId(null)
      setNoteInput("")
      void load()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Speichern")
    } finally {
      setSaving(false)
    }
  }

  const selected = selectedId ? errors.find((e) => e.id === selectedId) ?? null : null

  if (!authResolved) return null
  if (trainerRole !== "admin") {
    return (
      <div className="py-16 text-center text-sm text-zinc-500">
        Dieser Bereich ist nur für Admins zugänglich.
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Seitentitel */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">Fehlerprotokoll</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Technische Störungen und App-Fehler</p>
      </div>

      {/* A) Kurzstatus */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-[#d0dff0]">
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Offen</div>
              <div className="mt-1 text-2xl font-bold text-red-700">{overview.totalOpen}</div>
            </CardContent>
          </Card>
          <Card className="border-[#d0dff0]">
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Kritisch</div>
              <div className={`mt-1 text-2xl font-bold ${overview.totalCritical > 0 ? "text-red-700" : "text-zinc-400"}`}>
                {overview.totalCritical}
              </div>
            </CardContent>
          </Card>
          <Card className="border-[#d0dff0]">
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Heute</div>
              <div className="mt-1 text-2xl font-bold text-zinc-800">{overview.totalToday}</div>
            </CardContent>
          </Card>
          <Card className="border-[#d0dff0]">
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Letzte Auffälligkeit</div>
              <div className="mt-1 text-xs font-medium text-zinc-700 break-words">
                {overview.lastCriticalAt
                  ? formatDisplayDateTime(new Date(overview.lastCriticalAt))
                  : "–"}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* KI-Lageeinschätzung */}
      {summaryText && (
        <div className="rounded-xl border border-[#d0dff0] bg-[#f4f8fd] px-4 py-3 text-sm text-[#154c83]">
          <span className="mr-2 font-semibold">Lage:</span>{summaryText}
        </div>
      )}

      {/* B) Filterleiste */}
      <Card className="border-[#d0dff0]">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Zeitraum */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Zeitraum</label>
              <div className="flex gap-1">
                {(["24h", "7d", "30d"] as Range[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                      range === r
                        ? "border-[#154c83] bg-[#154c83] text-white"
                        : "border-[#d0dff0] bg-white text-zinc-700 hover:border-[#154c83]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as AppErrorStatus | "")}
                className="rounded-lg border border-[#d0dff0] bg-white px-2 py-1 text-xs text-zinc-800"
              >
                <option value="">Alle</option>
                <option value="open">Offen</option>
                <option value="acknowledged">Geprüft</option>
                <option value="resolved">Gelöst</option>
                <option value="ignored">Ignoriert</option>
              </select>
            </div>

            {/* Severity */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Schwere</label>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value as AppErrorSeverity | "")}
                className="rounded-lg border border-[#d0dff0] bg-white px-2 py-1 text-xs text-zinc-800"
              >
                <option value="">Alle</option>
                <option value="critical">Kritisch</option>
                <option value="high">Hoch</option>
                <option value="medium">Mittel</option>
                <option value="low">Niedrig</option>
              </select>
            </div>

            {/* Suche */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Suche</label>
              <input
                type="text"
                placeholder="Route, Quelle, Typ…"
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                className="rounded-lg border border-[#d0dff0] bg-white px-2 py-1 text-xs text-zinc-800 placeholder-zinc-400 w-44"
              />
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              className="self-end rounded-xl border-[#d0dff0] text-xs"
            >
              {loading ? "Lädt…" : "Aktualisieren"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Fehleranzeige */}
      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Fehler beim Laden: {fetchError}
        </div>
      )}

      {/* C) Fehlerliste */}
      {!loading && !fetchError && errors.length === 0 && (
        <div className="py-10 text-center text-sm text-zinc-500">
          Keine Fehler im gewählten Zeitraum gefunden.
        </div>
      )}

      {errors.length > 0 && (
        <Card className="border-[#d0dff0]">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-zinc-700">
              {errors.length} Einträge
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[#eef2f8]">
              {errors.map((err) => (
                <div
                  key={err.id}
                  className={`cursor-pointer px-4 py-3 transition hover:bg-[#f7fbff] ${selectedId === err.id ? "bg-[#eef4fb]" : ""}`}
                  onClick={() => {
                    if (selectedId === err.id) {
                      setSelectedId(null)
                      setNoteInput("")
                    } else {
                      setSelectedId(err.id)
                      setNoteInput(err.note ?? "")
                    }
                  }}
                >
                  <div className="flex flex-wrap items-start gap-2">
                    {/* Severity-Badge */}
                    <span className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${severityColor(err.severity)}`}>
                      {getSeverityLabel(err.severity)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-xs font-semibold text-zinc-800">{err.source}</span>
                        {err.route && (
                          <span className="text-xs text-zinc-500 font-mono">{err.route}</span>
                        )}
                        <span className="text-xs text-zinc-400">{err.error_type}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-700 line-clamp-1">{err.message}</div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className={`text-xs font-semibold ${statusColor(err.status)}`}>
                        {getStatusLabel(err.status)}
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {err.occurrence_count > 1 && `×${err.occurrence_count} · `}
                        {formatDisplayDateTime(new Date(err.last_seen_at))}
                      </div>
                    </div>
                  </div>

                  {/* D) Detail-Aufklapper */}
                  {selectedId === err.id && (
                    <div
                      className="mt-3 space-y-3 rounded-xl border border-[#d0dff0] bg-white p-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {err.details && (
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Details</div>
                          <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-zinc-700 font-mono">{err.details}</pre>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 sm:grid-cols-3">
                        {err.actor && (
                          <div><span className="font-semibold">Actor:</span> {err.actor}</div>
                        )}
                        {err.actor_role && (
                          <div><span className="font-semibold">Rolle:</span> {err.actor_role}</div>
                        )}
                        <div><span className="font-semibold">Erstmals:</span> {formatDisplayDateTime(new Date(err.first_seen_at))}</div>
                        <div><span className="font-semibold">Zuletzt:</span> {formatDisplayDateTime(new Date(err.last_seen_at))}</div>
                        <div><span className="font-semibold">Auftreten:</span> {err.occurrence_count}</div>
                      </div>

                      {/* Notiz */}
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Interne Notiz</div>
                        <textarea
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          placeholder="Notiz hinzufügen…"
                          rows={2}
                          maxLength={1000}
                          className="mt-1 w-full resize-none rounded-lg border border-[#d0dff0] bg-white px-2 py-1.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#154c83]"
                        />
                      </div>

                      {/* E) Aktionen */}
                      <div className="flex flex-wrap gap-2">
                        {err.status !== "acknowledged" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void handleStatusUpdate(err.id, "acknowledged", noteInput || undefined)}
                            className="rounded-xl border-amber-300 text-xs text-amber-700 hover:bg-amber-50"
                          >
                            Geprüft
                          </Button>
                        )}
                        {err.status !== "resolved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void handleStatusUpdate(err.id, "resolved", noteInput || undefined)}
                            className="rounded-xl border-green-300 text-xs text-green-700 hover:bg-green-50"
                          >
                            Gelöst
                          </Button>
                        )}
                        {err.status !== "ignored" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void handleStatusUpdate(err.id, "ignored", noteInput || undefined)}
                            className="rounded-xl border-zinc-200 text-xs text-zinc-500 hover:bg-zinc-50"
                          >
                            Ignorieren
                          </Button>
                        )}
                        {noteInput !== (err.note ?? "") && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void handleStatusUpdate(err.id, err.status, noteInput)}
                            className="rounded-xl border-[#154c83] text-xs text-[#154c83] hover:bg-[#eef4fb]"
                          >
                            Notiz speichern
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
