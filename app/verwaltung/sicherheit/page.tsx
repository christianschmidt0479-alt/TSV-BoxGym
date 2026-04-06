"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDisplayDateTime } from "@/lib/dateFormat"
import { useTrainerAccess } from "@/lib/useTrainerAccess"
import { useMarkSectionSeen } from "@/lib/useMarkSectionSeen"
import type { SecurityAlert } from "@/lib/aiSecurity"

type AuditLogRow = {
  id: string
  actor_role: string
  actor_email: string | null
  actor_name: string | null
  action: string
  target_type: string
  target_id: string | null
  target_name: string | null
  details: string | null
  created_at: string
}

function getActionLabel(action: string) {
  switch (action) {
    case "member_approved":
      return "Mitglied freigegeben"
    case "member_group_changed":
      return "Gruppe geändert"
    case "member_competition_changed":
      return "Wettkampfdaten geändert"
    case "member_trainer_assist_changed":
      return "Trainerhilfe geändert"
    case "member_profile_saved":
      return "Profil gespeichert"
    case "member_parent_unlinked":
      return "Elternkonto getrennt"
    case "member_deleted":
      return "Mitglied gelöscht"
    default:
      return action
  }
}

export default function SicherheitPage() {
  useMarkSectionSeen("security")
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [alerts, setAlerts] = useState<SecurityAlert[]>([])
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoadingAlerts(false)
      return
    }
    void fetch("/api/admin/ai-security-overview?range=24h", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.alerts) {
          setAlerts((data.alerts as SecurityAlert[]).filter((a) => a.isActive))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAlerts(false))
  }, [authResolved, trainerRole])

  async function dismissAlert(id: string) {
    if (dismissingId) return
    setDismissingId(id)
    try {
      const res = await fetch("/api/admin/ai-security-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: "alert", target_key: id, action_type: "acknowledged" }),
      })
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== id))
      }
    } finally {
      setDismissingId(null)
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/admin/audit-log", { cache: "no-store" })
        if (!response.ok) {
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as { rows: AuditLogRow[] }
        setRows(payload.rows ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, trainerRole])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Sicherheit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nur im Admin-Modus.</div>
          <Button asChild className="rounded-2xl">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Sicherheit</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung">Zurück zur Übersicht</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Audit-Einträge</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : rows.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Aktive Warnungen</div>
            <div className={`mt-1 text-3xl font-bold ${alerts.length > 0 ? "text-red-600" : "text-emerald-700"}`}>
              {loadingAlerts ? "…" : alerts.length}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Login-Schutz</div>
            <div className="mt-1 text-3xl font-bold text-emerald-700">Aktiv</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Fehlversuche</div>
            <div className="mt-1 text-sm text-zinc-700">Nach 5 Fehlversuchen 15 Minuten gesperrt.</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Aktive Warnungen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingAlerts ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Warnungen werden geladen…</div>
          ) : alerts.length === 0 ? (
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">Keine aktiven Warnungen.</div>
          ) : (
            alerts.map((alert) => {
              const levelStyles = {
                critical: { border: "border-red-200", bg: "bg-red-50", badge: "bg-red-100 text-red-700", label: "Kritisch" },
                warning: { border: "border-amber-200", bg: "bg-amber-50", badge: "bg-amber-100 text-amber-700", label: "Warnung" },
                info: { border: "border-blue-200", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-700", label: "Hinweis" },
              }[alert.level]
              return (
                <div key={alert.id} className={`rounded-xl border ${levelStyles.border} ${levelStyles.bg} px-4 py-3`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${levelStyles.badge}`}>
                        {levelStyles.label}
                      </span>
                      <span className="text-sm font-semibold text-zinc-800">{alert.title}</span>
                    </div>
                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                      {formatDisplayDateTime(new Date(alert.created_at))}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-600">{alert.message}</p>
                  {(alert.relatedRoute ?? alert.relatedIp) && (
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
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => dismissAlert(alert.id)}
                      disabled={dismissingId === alert.id}
                      className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {dismissingId === alert.id ? "…" : "✓ Geprüft & schließen"}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Audit-Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Sicherheitsdaten werden geladen...</div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Noch keine Audit-Einträge vorhanden.</div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">{getActionLabel(row.action)}</div>
                <div className="mt-1">
                  Ziel: {row.target_name || row.target_type} {row.target_id ? `· ${row.target_id}` : ""}
                </div>
                <div className="mt-1">
                  Durch: {row.actor_name || row.actor_email || row.actor_role}
                </div>
                {row.details ? <div className="mt-1 text-zinc-600">{row.details}</div> : null}
                <div className="mt-1 text-xs text-zinc-500">{formatDisplayDateTime(new Date(row.created_at))}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
