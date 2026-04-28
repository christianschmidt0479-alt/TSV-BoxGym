"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type CheckinRow = {
  id: string
  group_name?: string | null
  checkin_mode?: string | null
  date?: string | null
  time?: string | null
  weight?: number | null
  created_at?: string | null
  members?: {
    id?: string | null
    name?: string | null
    first_name?: string | null
    last_name?: string | null
    is_trial?: boolean | null
    base_group?: string | null
  } | null
}

type CheckinsResponse = {
  todayCheckins?: CheckinRow[]
}

function displayName(row: CheckinRow) {
  const first = row.members?.first_name?.trim() ?? ""
  const last = row.members?.last_name?.trim() ?? ""
  const fullName = `${first} ${last}`.trim()
  return fullName || row.members?.name?.trim() || "Unbekannt"
}

function checkinTime(row: CheckinRow) {
  if (row.time?.trim()) {
    return row.time
  }

  if (!row.created_at) {
    return "-"
  }

  const createdAt = new Date(row.created_at)
  if (Number.isNaN(createdAt.getTime())) {
    return "-"
  }

  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
  }).format(createdAt)
}

export default function TrainerHeuteDaClient() {
  const [rows, setRows] = useState<CheckinRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deletingById, setDeletingById] = useState<Record<string, boolean>>({})
  const [highlightedById, setHighlightedById] = useState<Record<string, boolean>>({})
  const [liveNotice, setLiveNotice] = useState("")
  const previousIdsRef = useRef<Set<string>>(new Set())
  const highlightTimersRef = useRef<Record<string, number>>({})
  const noticeTimerRef = useRef<number | null>(null)

  const todayIso = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  }, [])

  const loadRows = useCallback(async (options?: { background?: boolean }) => {
    try {
      if (!options?.background) {
        setLoading(true)
      }
      setError("")

      const response = await fetch(`/api/trainer/today?today=${encodeURIComponent(todayIso)}`, {
        method: "GET",
      })

      const payload = (await response.json().catch(() => ({}))) as CheckinsResponse
      if (!response.ok) {
        throw new Error("Check-ins konnten nicht geladen werden")
      }

      const todayRows = (Array.isArray(payload.todayCheckins) ? payload.todayCheckins : [])
        .sort((a, b) => {
          const aDate = a.created_at ? new Date(a.created_at).getTime() : 0
          const bDate = b.created_at ? new Date(b.created_at).getTime() : 0
          return bDate - aDate
        })

      const previousIds = previousIdsRef.current
      const newRows =
        previousIds.size > 0
          ? todayRows.filter((row) => !previousIds.has(row.id))
          : []

      if (newRows.length > 0) {
        const newIds = newRows.map((row) => row.id)
        setHighlightedById((prev) => {
          const next = { ...prev }
          for (const id of newIds) {
            next[id] = true
          }
          return next
        })

        for (const id of newIds) {
          const existingTimer = highlightTimersRef.current[id]
          if (existingTimer) {
            window.clearTimeout(existingTimer)
          }

          highlightTimersRef.current[id] = window.setTimeout(() => {
            setHighlightedById((prev) => {
              const next = { ...prev }
              delete next[id]
              return next
            })
            delete highlightTimersRef.current[id]
          }, 2500)
        }

        const firstName = displayName(newRows[0])
        const extraCount = newRows.length - 1
        setLiveNotice(extraCount > 0 ? `Eingecheckt: ${firstName} +${extraCount}` : `Eingecheckt: ${firstName}`)

        if (noticeTimerRef.current !== null) {
          window.clearTimeout(noticeTimerRef.current)
        }
        noticeTimerRef.current = window.setTimeout(() => {
          setLiveNotice("")
          noticeTimerRef.current = null
        }, 2500)
      }

      previousIdsRef.current = new Set(todayRows.map((row) => row.id))

      setRows(todayRows)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Check-ins konnten nicht geladen werden")
    } finally {
      if (!options?.background) {
        setLoading(false)
      }
    }
  }, [todayIso])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState !== "visible") {
        return
      }
      void loadRows({ background: true })
    }

    const intervalId = window.setInterval(refreshIfVisible, 5000)
    const handleVisibilityChange = () => {
      refreshIfVisible()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [loadRows])

  useEffect(() => {
    return () => {
      for (const id of Object.keys(highlightTimersRef.current)) {
        window.clearTimeout(highlightTimersRef.current[id])
      }
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }
    }
  }, [])

  async function handleDelete(checkinId: string) {
    const confirmed = window.confirm("Diesen Check-in wirklich auschecken?")
    if (!confirmed) {
      return
    }

    setDeletingById((prev) => ({ ...prev, [checkinId]: true }))
    setError("")

    try {
      const response = await fetch("/api/admin/checkins", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ checkinId }),
      })

      if (!response.ok) {
        throw new Error("Auschecken fehlgeschlagen")
      }

      await loadRows()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Auschecken fehlgeschlagen")
    } finally {
      setDeletingById((prev) => ({ ...prev, [checkinId]: false }))
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-2xl bg-[#154c83] px-4 py-3 text-base font-semibold text-white">
          Heute da
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <div className="text-sm text-zinc-600">Heutige Anwesenheit</div>
            <div className="text-2xl font-extrabold text-zinc-900">{rows.length}</div>
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

        {liveNotice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {liveNotice}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
            Check-ins werden geladen...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
            Heute sind noch keine Check-ins vorhanden.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const personType = row.members?.is_trial ? "Probemitglied" : "Mitglied"
              const groupName = row.group_name || row.members?.base_group || "-"
              const weightText = row.weight == null ? "-" : `${row.weight} kg`

              return (
                <div
                  key={row.id}
                  className={`rounded-xl border px-4 py-3 shadow-sm transition-colors ${
                    highlightedById[row.id]
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-base font-semibold text-zinc-900">{displayName(row)}</div>
                      <div className="mt-1 text-sm text-zinc-600">
                        Gruppe: {groupName} · Zeit: {checkinTime(row)}
                      </div>
                      <div className="mt-1 text-sm text-zinc-600">
                        Typ: {personType} · Gewicht: {weightText}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleDelete(row.id)}
                      disabled={Boolean(deletingById[row.id])}
                      className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {deletingById[row.id] ? "Auschecken..." : "Auschecken"}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
