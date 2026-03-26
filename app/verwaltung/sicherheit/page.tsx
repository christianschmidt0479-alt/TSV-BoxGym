"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

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
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AuditLogRow[]>([])

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

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Audit-Einträge</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : rows.length}</div>
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
                <div className="mt-1 text-xs text-zinc-500">{new Date(row.created_at).toLocaleString("de-DE")}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
