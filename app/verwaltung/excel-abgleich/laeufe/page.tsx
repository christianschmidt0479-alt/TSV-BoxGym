"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDisplayDateTime } from "@/lib/dateFormat"
import { getOfficeListStatusBadgeClass } from "@/lib/officeListStatus"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type ReconcileMetricSummary = {
  excelTotal: number
  foundInDb: number
  green: number
  yellow: number
  red: number
  gray: number
}

type RunHistoryEntry = {
  id: string
  checkedAt: string
  isActive: boolean
  runStatus: "green" | "gray"
  fileCount: number
  metrics: ReconcileMetricSummary
}

type ReconcileResponse = {
  runId: string | null
  runStatus: "green" | "gray"
  isActive: boolean
  checkedAt: string
  fileCount: number
  metrics: ReconcileMetricSummary
  history: RunHistoryEntry[]
}

function formatCheckedAt(value: string) {
  return formatDisplayDateTime(new Date(value))
}

function formatHistorySummary(metrics: ReconcileMetricSummary) {
  return `${metrics.green} grün · ${metrics.yellow} gelb · ${metrics.red} rot · ${metrics.gray} grau`
}

export default function ExcelAbgleichLaeufePage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [result, setResult] = useState<ReconcileResponse | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") return

    let cancelled = false

    void (async () => {
      try {
        const response = await fetch("/api/admin/excel-abgleich", { method: "GET" })

        if (response.status === 204) {
          if (!cancelled) {
            setResult(null)
          }
          return
        }

        if (!response.ok) {
          if (response.status === 401) {
            clearTrainerAccess()
          }
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as ReconcileResponse
        if (cancelled) return
        setResult(payload)
      } catch (nextError) {
        if (cancelled) return
        setError(nextError instanceof Error ? nextError.message : "Läufe konnten nicht geladen werden.")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authResolved, trainerRole])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return <div className="text-sm text-zinc-500">Dieser Bereich ist nur mit Adminzugang verfügbar.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Laufdokumentation</h1>
          <p className="mt-2 text-sm text-zinc-500">Aktiver GS-Sammelabgleich mit kompakter Historie und kurzer Dokumentation zur Einordnung der Läufe.</p>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung/excel-abgleich">Zurück zum Excel-Abgleich</Link>
        </Button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Dokumentation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-700">
          <p>Jeder Sammelabgleich speichert einen aktiven Lauf. Ein neuer Lauf ersetzt den vorherigen aktiven Lauf und schiebt ältere Ergebnisse in die Historie.</p>
          <p>Die Laufübersicht dient zur Nachvollziehbarkeit: Zeitstempel, Dateianzahl und Statusverteilung zeigen, wie sich ein Abgleich verändert hat.</p>
          <p>Wenn sich Regeln im Matching ändern, müssen bestehende Excel-Dateien erneut abgeglichen werden, damit die Historie und der aktive Lauf mit der neuen Logik neu berechnet werden.</p>
        </CardContent>
      </Card>

      {result ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Aktiver Lauf</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-700">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-zinc-900">{formatCheckedAt(result.checkedAt)}</span>
                <Badge variant="outline" className={getOfficeListStatusBadgeClass(result.runStatus)}>
                  {result.isActive ? "Aktiv" : "Archiv"}
                </Badge>
              </div>
              <div>{result.fileCount} Datei(en)</div>
              <div>{formatHistorySummary(result.metrics)}</div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                DB-Treffer: {result.metrics.foundInDb} von {result.metrics.excelTotal} Excel-Zeilen
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Historie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.history.length > 0 ? (
                result.history.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-900">{formatCheckedAt(entry.checkedAt)}</span>
                      <Badge variant="outline" className={getOfficeListStatusBadgeClass(entry.runStatus)}>
                        {entry.isActive ? "Aktiv" : "Archiv"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">{entry.fileCount} Datei(en) · {formatHistorySummary(entry.metrics)}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">Noch keine gespeicherten Läufe vorhanden.</div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5 text-sm text-zinc-500">Noch kein gespeicherter GS-Sammelabgleich vorhanden.</CardContent>
        </Card>
      )}
    </div>
  )
}