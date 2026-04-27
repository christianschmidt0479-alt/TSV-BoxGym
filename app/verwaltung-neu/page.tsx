"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { container, card, pageTitle } from "@/lib/ui"

export default function DashboardPage() {
  const [totalMembers, setTotalMembers] = useState<number | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null)
  const [disableCheckinTimeWindow, setDisableCheckinTimeWindow] = useState(false)
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

        const result = (await response.json()) as { disableCheckinTimeWindow?: boolean }
        setDisableCheckinTimeWindow(Boolean(result.disableCheckinTimeWindow))
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

  async function handleToggleCheckinTimeWindow(nextValue: boolean) {
    setCheckinSettingsSaving(true)
    setCheckinSettingsError("")

    try {
      const response = await fetch("/api/admin/checkin-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disableCheckinTimeWindow: nextValue }),
      })

      if (!response.ok) {
        setCheckinSettingsError("Ferienmodus konnte nicht gespeichert werden.")
        return
      }

      const result = (await response.json()) as { disableCheckinTimeWindow?: boolean }
      setDisableCheckinTimeWindow(Boolean(result.disableCheckinTimeWindow))
    } catch {
      setCheckinSettingsError("Ferienmodus konnte nicht gespeichert werden.")
    } finally {
      setCheckinSettingsSaving(false)
    }
  }

  const statCard = {
    ...card,
    cursor: "pointer" as const,
    textDecoration: "none" as const,
    display: "block",
    marginBottom: 12,
  }

  return (
    <div style={container}>
      <div style={pageTitle}>Admin-Übersicht</div>

      <Link href="/verwaltung-neu/mitglieder" style={{ textDecoration: "none" }}>
        <div style={statCard}>
          <div style={{ fontSize: 14, color: "#666" }}>Mitglieder gesamt</div>
          <div style={{ fontSize: 22, fontWeight: 600, margin: "6px 0" }}>
            {totalMembers ?? "…"}
          </div>
        </div>
      </Link>

      <Link href="/verwaltung-neu/freigaben" style={{ textDecoration: "none" }}>
        <div style={statCard}>
          <div style={{ fontSize: 14, color: "#666" }}>Offene Freigaben</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              margin: "6px 0",
              color: pendingApprovals ? "#b45309" : "#15803d",
            }}
          >
            {pendingApprovals ?? "…"}
          </div>
        </div>
      </Link>

      <Link href="/verwaltung-neu/qr-code" style={{ textDecoration: "none" }}>
        <div style={statCard}>
          <div style={{ fontSize: 14, color: "#666" }}>QR Code</div>
          <div style={{ fontSize: 16, fontWeight: 600, margin: "6px 0" }}>Anzeigen →</div>
        </div>
      </Link>

      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Check-in Einstellungen</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, color: "#444" }}>Ferienmodus</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
              {checkinSettingsLoading ? "Lädt..." : disableCheckinTimeWindow ? "ON" : "OFF"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleCheckinTimeWindow(!disableCheckinTimeWindow)}
            disabled={checkinSettingsLoading || checkinSettingsSaving}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 10,
              background: "#fff",
              padding: "8px 12px",
              fontWeight: 600,
              cursor: checkinSettingsLoading || checkinSettingsSaving ? "not-allowed" : "pointer",
              opacity: checkinSettingsLoading || checkinSettingsSaving ? 0.6 : 1,
            }}
          >
            {disableCheckinTimeWindow ? "ON" : "OFF"}
          </button>
        </div>
        {checkinSettingsError ? (
          <div style={{ marginTop: 10, fontSize: 13, color: "#b91c1c" }}>{checkinSettingsError}</div>
        ) : null}
      </div>
    </div>
  )
}

