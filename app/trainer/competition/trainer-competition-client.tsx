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
import type { BoxingWeightClassResult } from "@/lib/boxingWeightClass"

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
  weightClass: BoxingWeightClassResult
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

function formatWeightClassRange(minKg: number | null, maxKg: number | null) {
  if (minKg === null && maxKg === null) return "-"
  if (minKg === null && maxKg !== null) return `unter ${maxKg} kg`
  if (minKg !== null && maxKg === null) return `ab ${minKg} kg`
  return `über ${minKg} kg bis unter ${maxKg} kg`
}

export default function TrainerCompetitionClient() {
  const [members, setMembers] = useState<CompetitionMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filterMode, setFilterMode] = useState<"needs_attention" | "all" | "above_target">("needs_attention")

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

  const summary = useMemo(() => {
    return {
      needsAttention: members.filter((member) => member.status === "needs_attention").length,
      aboveTarget: members.filter((member) => member.status === "above_target").length,
      inRange: members.filter((member) => member.status === "in_range").length,
    }
  }, [members])

  const visibleMembers = useMemo(() => {
    const filtered = members.filter((member) => {
      if (filterMode === "all") return true
      if (filterMode === "above_target") return member.status === "above_target"
      return member.status === "needs_attention"
    })

    return [...filtered].sort((a, b) => {
      const absA = a.distanceKg !== null ? Math.abs(a.distanceKg) : -1
      const absB = b.distanceKg !== null ? Math.abs(b.distanceKg) : -1
      if (absA !== absB) return absB - absA
      return a.name.localeCompare(b.name, "de")
    })
  }, [members, filterMode])

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-2xl bg-[#154c83] px-4 py-3 text-base font-semibold text-white">
          Gewicht &amp; Ziel (Wettkämpfer / L-Gruppe)
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <div className="text-sm text-zinc-600">Sportlich relevante Mitglieder</div>
            <div className="text-2xl font-extrabold text-zinc-900">{visibleMembers.length}</div>
          </div>
          <Link
            href="/trainer"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Zurück zum Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm sm:grid-cols-3">
          <div className="rounded-lg bg-red-50 px-3 py-2">
            <div className="text-xs text-red-700">Achtung</div>
            <div className="text-lg font-extrabold text-red-800">{summary.needsAttention}</div>
          </div>
          <div className="rounded-lg bg-amber-50 px-3 py-2">
            <div className="text-xs text-amber-700">Über Ziel</div>
            <div className="text-lg font-extrabold text-amber-800">{summary.aboveTarget}</div>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-2">
            <div className="text-xs text-emerald-700">Im Ziel</div>
            <div className="text-lg font-extrabold text-emerald-800">{summary.inRange}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterMode("needs_attention")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filterMode === "needs_attention"
                ? "border-red-300 bg-red-100 text-red-800"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            Achtung
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("above_target")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filterMode === "above_target"
                ? "border-amber-300 bg-amber-100 text-amber-800"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            Über Ziel
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filterMode === "all"
                ? "border-zinc-400 bg-zinc-200 text-zinc-800"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            Alle
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
            Gewichtsdaten werden geladen...
          </div>
        ) : visibleMembers.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
            Keine relevanten Mitglieder für Gewichtsauswertung gefunden.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleMembers.map((member) => (
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

                <div className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                  <div className="text-xs text-zinc-500">Gewichtsklasse</div>
                  <div className="mt-0.5 font-semibold text-zinc-900">
                    {member.weightClass.note
                      ? member.weightClass.note
                      : `${member.weightClass.className} / ${member.weightClass.label}`}
                  </div>
                  {!member.weightClass.note ? (
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {formatWeightClassRange(member.weightClass.minKg, member.weightClass.maxKg)}
                    </div>
                  ) : null}
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
