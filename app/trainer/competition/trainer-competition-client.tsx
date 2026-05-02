"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getWeightStatusBadgeClass,
  getWeightStatusLabel,
  getWeightTrendBadgeClass,
  getWeightTrendLabel,
  type WeightAnalysisStatus,
  type WeightAnalysisTrend,
} from "@/lib/weightAnalysis"

type WeightEntry = {
  created_at: string
  weight_kg: number
  source: string
  note: string | null
}

type CompetitionMember = {
  id: string
  name: string
  group: string | null
  targetWeightKg: number | null
  lastWeightKg: number | null
  distanceKg: number | null
  status: WeightAnalysisStatus
  trend: WeightAnalysisTrend
  message: string
  lastChangeKg: number | null
  logs: WeightEntry[]
}

type CompetitionResponse = {
  members?: CompetitionMember[]
  viewerRole?: "trainer" | "admin" | null
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(date)
}

export default function TrainerCompetitionClient() {
  const [members, setMembers] = useState<CompetitionMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError("")

      const response = await fetch("/api/trainer/competition", { method: "GET" })
      if (!response.ok) {
        throw new Error("Gewichtsdaten konnten nicht geladen werden")
      }

      const payload = (await response.json().catch(() => ({}))) as CompetitionResponse
      setMembers(Array.isArray(payload.members) ? payload.members : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gewichtsdaten konnten nicht geladen werden")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => a.name.localeCompare(b.name, "de"))
  }, [members])

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-2xl bg-[#154c83] px-4 py-3 text-base font-semibold text-white">
          Gewicht &amp; Ziel (Wettkämpfer / L-Gruppe)
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <div className="text-sm text-zinc-600">Sportlich relevante Mitglieder</div>
            <div className="text-2xl font-extrabold text-zinc-900">{sortedMembers.length}</div>
          </div>
          <Link
            href="/trainer"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Zurück zum Dashboard
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
            Gewichtsdaten werden geladen...
          </div>
        ) : sortedMembers.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
            Keine relevanten Mitglieder für Gewichtsauswertung gefunden.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedMembers.map((member) => (
              <div key={member.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{member.name}</div>
                    <div className="mt-1 text-sm text-zinc-600">Gruppe: {member.group || "-"}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getWeightStatusBadgeClass(member.status)}`}>
                      {getWeightStatusLabel(member.status)}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getWeightTrendBadgeClass(member.trend)}`}>
                      {getWeightTrendLabel(member.trend)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <div className="text-xs text-zinc-500">Ziel</div>
                    <div className="mt-0.5 font-semibold text-zinc-900">
                      {member.targetWeightKg !== null ? `${member.targetWeightKg} kg` : "Nicht hinterlegt"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <div className="text-xs text-zinc-500">Letztes Gewicht</div>
                    <div className="mt-0.5 font-semibold text-zinc-900">
                      {member.lastWeightKg !== null ? `${member.lastWeightKg} kg` : "Kein Eintrag"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <div className="text-xs text-zinc-500">Abstand</div>
                    <div className="mt-0.5 font-semibold text-zinc-900">
                      {member.distanceKg !== null
                        ? member.distanceKg > 0
                          ? `+${member.distanceKg} kg`
                          : `${member.distanceKg} kg`
                        : "-"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <div className="text-xs text-zinc-500">Letzte Veränderung</div>
                    <div className="mt-0.5 font-semibold text-zinc-900">
                      {member.lastChangeKg !== null
                        ? member.lastChangeKg > 0
                          ? `+${member.lastChangeKg} kg`
                          : `${member.lastChangeKg} kg`
                        : "Nicht berechenbar"}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-zinc-500">{member.message}</p>

                <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Verlauf (letzte 10)</summary>
                  {member.logs.length === 0 ? (
                    <div className="mt-2 text-sm text-zinc-500">Noch keine Gewichtseinträge vorhanden.</div>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {member.logs.map((entry, idx) => (
                        <li key={`${member.id}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-2 py-1 text-sm">
                          <span className="text-zinc-500">{formatDate(entry.created_at)}</span>
                          <span className="font-semibold text-zinc-900">{entry.weight_kg} kg</span>
                          <span className="text-zinc-600">{entry.source === "manual" ? "manuell" : "checkin"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
