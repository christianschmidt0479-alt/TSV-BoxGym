"use client"

import { useEffect, useState } from "react"
import Link from "next/link"


export default function DashboardPage() {
  const [totalMembers, setTotalMembers] = useState<number | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null)
  const [disableCheckinTimeWindow, setDisableCheckinTimeWindow] = useState(false)
  const [disableNormalCheckinTimeWindow, setDisableNormalCheckinTimeWindow] = useState(false)
  const [checkinSettingsLoading, setCheckinSettingsLoading] = useState(true)
  const [checkinSettingsSaving, setCheckinSettingsSaving] = useState(false)
  const [checkinSettingsError, setCheckinSettingsError] = useState("")

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      const res = await fetch("/api/admin/get-members", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, pageSize: 999 }),
      })
      if (!res.ok) return

      const result = await res.json()
      const members: { is_approved?: boolean }[] = result.data ?? []
      setTotalMembers(result.total ?? members.length)
      setPendingApprovals(members.filter((m) => !m.is_approved).length)
    }

    void load().catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") {
        return
      }
    })

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadCheckinSettings() {
      try {
        const response = await fetch("/api/admin/checkin-settings", {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        })

        if (!response.ok) {
          setCheckinSettingsError("Check-in Einstellungen konnten nicht geladen werden.")
          return
        }

        const result = (await response.json()) as {
          disableCheckinTimeWindow?: boolean
          disableNormalCheckinTimeWindow?: boolean
        }
        setDisableCheckinTimeWindow(Boolean(result.disableCheckinTimeWindow))
        setDisableNormalCheckinTimeWindow(Boolean(result.disableNormalCheckinTimeWindow))
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
        setCheckinSettingsError("Check-in Einstellungen konnten nicht geladen werden.")
      } finally {
        setCheckinSettingsLoading(false)
      }
    }

    void loadCheckinSettings()

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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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

        <Link href="/verwaltung-neu/qr-code" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-400">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">QR Code</div>
          <div className="text-2xl font-extrabold text-zinc-900">QR</div>
          <div className="mt-1 text-sm text-zinc-600">Anzeigen und herunterladen</div>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/verwaltung-neu/mitglieder" className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400">
          <div>Mitglieder</div>
          <div className="mt-1 text-sm font-medium text-zinc-600">Alle Mitglieder und Check-ins</div>
        </Link>
        <Link href="/verwaltung-neu/freigaben" className="rounded-2xl border border-zinc-300 bg-white px-5 py-5 text-lg font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400">
          <div>Freigaben</div>
          <div className="mt-1 text-sm font-medium text-zinc-600">Neue Mitglieder freigeben</div>
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

