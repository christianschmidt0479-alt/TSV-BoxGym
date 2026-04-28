"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { saveGsStatusMap, type TsvStatus } from "./gsStatusStore"

type ResultStatus = "match" | "mismatch" | "not_found"

type GsResultRow = {
  memberId: string | null
  firstName: string
  lastName: string
  birthdate: string | null
  group: string | null
  status: ResultStatus
}

type GsCompareResponse = {
  results?: GsResultRow[]
  memberStatuses?: Record<string, TsvStatus>
  error?: string
}

function statusLabel(status: ResultStatus) {
  if (status === "match") return "vorhanden"
  if (status === "mismatch") return "Name stimmt, DOB abweichend"
  return "kein Treffer"
}

function statusClassName(status: ResultStatus) {
  if (status === "match") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "mismatch") return "bg-amber-50 text-amber-700 border-amber-200"
  return "bg-red-50 text-red-700 border-red-200"
}

export default function GsAbgleichPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [results, setResults] = useState<GsResultRow[]>([])

  const hasResults = results.length > 0

  const summary = useMemo(() => {
    const totals = { match: 0, mismatch: 0, not_found: 0 }
    for (const row of results) {
      totals[row.status] += 1
    }
    return totals
  }, [results])

  async function handleUpload() {
    if (!file) {
      setError("Bitte zuerst eine Datei auswählen.")
      return
    }

    setLoading(true)
    setError("")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/admin/gs-abgleich", {
        method: "POST",
        body: formData,
      })

      const payload = (await response.json().catch(() => ({}))) as GsCompareResponse

      if (!response.ok) {
        throw new Error(payload.error || "Upload fehlgeschlagen")
      }

      setResults(Array.isArray(payload.results) ? payload.results : [])
      saveGsStatusMap(payload.memberStatuses ?? {})
    } catch (uploadError) {
      setResults([])
      setError(uploadError instanceof Error ? uploadError.message : "Upload fehlgeschlagen")
    } finally {
      setLoading(false)
    }
  }

  return (

    <div className="space-y-4">

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setError("")
            }}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              void handleUpload()
            }}
            disabled={loading}
            className="rounded-lg bg-[#154c83] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123d69] disabled:opacity-60"
          >
            {loading ? "Lade..." : "Datei hochladen"}
          </button>
        </div>

        <div className="mt-2 text-xs text-zinc-500">Erlaubte Formate: xlsx, xls, csv</div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
      </div>

      {hasResults ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
            <span className="font-semibold">Match:</span> {summary.match} · <span className="font-semibold">Mismatch:</span>{" "}
            {summary.mismatch} · <span className="font-semibold">Not found:</span> {summary.not_found}
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-700">
                <tr>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Geburtsdatum</th>
                  <th className="px-3 py-2 font-semibold">Gruppe</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, index) => (
                  <tr key={`${row.firstName}-${row.lastName}-${row.birthdate ?? "-"}-${index}`} className="border-t border-zinc-100">
                    <td className="px-3 py-2">{row.firstName} {row.lastName}</td>
                    <td className="px-3 py-2">{row.birthdate || "-"}</td>
                    <td className="px-3 py-2">{row.group || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClassName(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-sm text-zinc-500">
          Ergebnisbereich ist leer.
        </div>
      )}

      <div>
        <Link
          href="/verwaltung-neu"
          className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
        >
          Zurueck zur Verwaltung
        </Link>
      </div>
    </div>
  )
}
