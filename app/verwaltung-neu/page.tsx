"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type TodayCheckinRow = {
  id: string
  member_id?: string | null
  group_name?: string | null
  time?: string | null
  created_at?: string | null
  members?: {
    name?: string | null
    first_name?: string | null
    last_name?: string | null
    is_trial?: boolean | null
  } | null
}

type AdminCheckinsResponse = {
  todayRows?: TodayCheckinRow[]
}

export default function DashboardPage() {
  const [totalMembers, setTotalMembers] = useState<number | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null)
  const [todayCheckins, setTodayCheckins] = useState<TodayCheckinRow[]>([])
  const [loadingTodayCheckins, setLoadingTodayCheckins] = useState(true)
  const [disableCheckinTimeWindow, setDisableCheckinTimeWindow] = useState(false)
  const [disableNormalCheckinTimeWindow, setDisableNormalCheckinTimeWindow] = useState(false)
  const [checkinSettingsLoading, setCheckinSettingsLoading] = useState(true)
  const [checkinSettingsSaving, setCheckinSettingsSaving] = useState(false)
  const [checkinSettingsError, setCheckinSettingsError] = useState("")

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      // Prioritize KPI tiles for faster first usable render.
      const membersRes = await fetch("/api/admin/get-members", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryOnly: true }),
      })

      if (membersRes.ok) {
        const result = (await membersRes.json()) as { total?: number; pendingCount?: number }
        setTotalMembers(result.total ?? 0)
        setPendingApprovals(result.pendingCount ?? 0)
      }

      // Defer non-critical dashboard sections by one frame.
      requestAnimationFrame(() => {
        void Promise.allSettled([
          (async () => {
            const checkinsRes = await fetch("/api/admin/checkins?scope=today&compact=1&limit=40", {
              method: "GET",
              credentials: "include",
              signal: controller.signal,
            })

            if (checkinsRes.ok) {
              const result = (await checkinsRes.json()) as AdminCheckinsResponse
              setTodayCheckins(Array.isArray(result.todayRows) ? result.todayRows : [])
            } else {
              setTodayCheckins([])
            }
            setLoadingTodayCheckins(false)
          })(),
          (async () => {
            const settingsRes = await fetch("/api/admin/checkin-settings", {
              method: "GET",
              credentials: "include",
              signal: controller.signal,
            })

            if (settingsRes.ok) {
              const result = (await settingsRes.json()) as {
                disableCheckinTimeWindow?: boolean
                disableNormalCheckinTimeWindow?: boolean
              }
              setDisableCheckinTimeWindow(Boolean(result.disableCheckinTimeWindow))
              setDisableNormalCheckinTimeWindow(Boolean(result.disableNormalCheckinTimeWindow))
            } else {
              setCheckinSettingsError("Check-in Einstellungen konnten nicht geladen werden.")
            }
            setCheckinSettingsLoading(false)
          })(),
        ])
      })
    }

    void loadDashboard().catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") {
        return
      }
      setTodayCheckins([])
      setLoadingTodayCheckins(false)
      setCheckinSettingsLoading(false)
    })

    return () => {
      controller.abort()
    }
  }, [])

  async function saveCheckinSettings(nextValues: {
    disableCheckinTimeWindow: boolean
    disableNormalCheckinTimeWindow: boolean
  }) {
    setCheckinSettingsSaving(true)
    setCheckinSettingsError("")

    try {
      const response = await fetch("/api/admin/checkin-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextValues),
      })

      if (!response.ok) {
        setCheckinSettingsError("Ferienmodus konnte nicht gespeichert werden.")
        return
      }

      const result = (await response.json()) as {
        disableCheckinTimeWindow?: boolean
        disableNormalCheckinTimeWindow?: boolean
      }
      setDisableCheckinTimeWindow(Boolean(result.disableCheckinTimeWindow))
      setDisableNormalCheckinTimeWindow(Boolean(result.disableNormalCheckinTimeWindow))
    } catch {
      setCheckinSettingsError("Check-in Einstellungen konnten nicht gespeichert werden.")
    } finally {
      setCheckinSettingsSaving(false)
    }
  }

  function displayMemberName(row: TodayCheckinRow) {
    const first = row.members?.first_name?.trim() ?? ""
    const last = row.members?.last_name?.trim() ?? ""
    const fullName = `${first} ${last}`.trim()
    return fullName || row.members?.name?.trim() || "Unbekannt"
  }

  function displayCheckinType(row: TodayCheckinRow) {
    if (typeof row.members?.is_trial === "boolean") {
      return row.members.is_trial ? "Probemitglied" : "Mitglied"
    }

    return "Typ unbekannt"
  }

  function displayGroupName(row: TodayCheckinRow) {
    const groupName = row.group_name?.trim()
    return groupName || "Gruppe unbekannt"
  }

  function displayCheckinTime(row: TodayCheckinRow) {
    if (row.time?.trim()) {
      return row.time.trim()
    }

    if (row.created_at) {
      const value = new Date(row.created_at)
      if (!Number.isNaN(value.getTime())) {
        return new Intl.DateTimeFormat("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Europe/Berlin",
        }).format(value)
      }
    }

    return null
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <Link href="/verwaltung-neu/mitglieder" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-400">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Mitglieder gesamt</div>
          <div className="text-2xl font-extrabold text-zinc-900">{totalMembers ?? "…"}</div>
          <div className="mt-1 text-sm text-zinc-600">Mitgliederliste öffnen</div>
        </Link>

        <Link href="/verwaltung-neu/freigaben" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-400">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Offene Freigaben</div>
          <div className={`text-2xl font-extrabold ${pendingApprovals ? "text-amber-700" : "text-emerald-700"}`}>
            {pendingApprovals ?? "…"}
          </div>
          <div className="mt-1 text-sm text-zinc-600">Freigaben prüfen</div>
        </Link>

        <Link href="/verwaltung-neu/gs-abgleich" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-400">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">GS-Abgleich</div>
          <div className="text-2xl font-extrabold text-zinc-900">GS</div>
          <div className="mt-1 text-sm text-zinc-600">TSV Status prüfen</div>
        </Link>

        <Link href="/verwaltung-neu/qr-code" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-400">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">QR Code</div>
          <div className="text-2xl font-extrabold text-zinc-900">QR</div>
          <div className="mt-1 text-sm text-zinc-600">Anzeigen und herunterladen</div>
        </Link>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-base font-semibold text-emerald-900">Heute im Training</div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Teilnehmer heute</div>
            <div className="text-2xl font-extrabold text-emerald-800">{loadingTodayCheckins ? "…" : todayCheckins.length}</div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {loadingTodayCheckins ? (
            <div className="text-sm text-emerald-900/80">Lade heutige Check-ins...</div>
          ) : todayCheckins.length === 0 ? (
            <div className="text-sm text-emerald-900/80">Heute noch niemand eingecheckt.</div>
          ) : (
            todayCheckins.map((row) => {
              const time = displayCheckinTime(row)
              const memberName = displayMemberName(row)
              const groupLabel = displayGroupName(row)

              return (
                <div key={row.id} className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    {row.member_id ? (
                      <Link href={`/verwaltung-neu/mitglieder/${row.member_id}`} className="font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500">
                        {memberName}
                      </Link>
                    ) : (
                      <span className="font-semibold text-zinc-900">{memberName}</span>
                    )}
                    <span className="text-zinc-500">—</span>
                    <span className="text-zinc-700">{groupLabel}</span>
                    {time ? (
                      <>
                        <span className="text-zinc-500">•</span>
                        <span className="text-zinc-700">{time}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Link href="/verwaltung-neu/mitglieder" className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400">
          <div>Mitglieder</div>
          <div className="mt-1 text-sm font-medium text-zinc-600">Alle Mitglieder und Check-ins</div>
        </Link>
        <Link href="/verwaltung-neu/freigaben" className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400">
          <div>Freigaben</div>
          <div className="mt-1 text-sm font-medium text-zinc-600">Neue Mitglieder freigeben</div>
        </Link>
        <Link href="/verwaltung-neu/gs-abgleich" className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400">
          <div>GS-Abgleich</div>
          <div className="mt-1 text-sm font-medium text-zinc-600">TSV Match prüfen</div>
        </Link>
        <Link href="/verwaltung-neu/probemitglieder" className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400">
          <div>Probemitglieder</div>
          <div className="mt-1 text-sm font-medium text-zinc-600">Probetraining-Übersicht</div>
        </Link>
        <Link href="/verwaltung-neu/trainer" className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400">
          <div>Trainer</div>
          <div className="mt-1 text-sm font-medium text-zinc-600">Trainerverwaltung</div>
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
        <div className="mb-3 text-base font-semibold text-zinc-900">Check-in Einstellungen</div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-700">Ferienmodus</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {checkinSettingsLoading ? "Lädt..." : disableCheckinTimeWindow ? "Aktiv – Zeitfenster deaktiviert" : "Inaktiv – Zeitfenster aktiv"}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              void saveCheckinSettings({
                disableCheckinTimeWindow: !disableCheckinTimeWindow,
                disableNormalCheckinTimeWindow,
              })
            }
            disabled={checkinSettingsLoading || checkinSettingsSaving}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
              disableCheckinTimeWindow
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400"
            }`}
          >
            {checkinSettingsSaving ? "Speichern..." : disableCheckinTimeWindow ? "Ferienmodus ON" : "Ferienmodus OFF"}
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-zinc-700">Zeitfenster im Normalmodus deaktivieren</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              Testmodus: Mitglieder können außerhalb des normalen Check-in-Zeitfensters einchecken. Gilt nur, wenn der
              Ferienmodus ausgeschaltet ist.
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              void saveCheckinSettings({
                disableCheckinTimeWindow,
                disableNormalCheckinTimeWindow: !disableNormalCheckinTimeWindow,
              })
            }
            disabled={checkinSettingsLoading || checkinSettingsSaving}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
              disableNormalCheckinTimeWindow
                ? "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"
                : "border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400"
            }`}
          >
            {checkinSettingsSaving
              ? "Speichern..."
              : disableNormalCheckinTimeWindow
                ? "Testmodus ON"
                : "Testmodus OFF"}
          </button>
        </div>
        {checkinSettingsError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{checkinSettingsError}</div>
        ) : null}
      </div>
    </div>
  )
}

