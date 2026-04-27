"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

type TrainerMemberRow = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  base_group?: string | null
  is_trial?: boolean | null
}

type CheckinRow = {
  id: string
  member_id?: string | null
  group_name?: string | null
  date?: string | null
  time?: string | null
  created_at?: string | null
  members?: {
    id?: string | null
    is_trial?: boolean | null
  } | null
}

type MembersResponse = {
  members?: TrainerMemberRow[]
}

type CheckinsResponse = {
  rows?: CheckinRow[]
}

type TrialMemberView = {
  member: TrainerMemberRow
  todayRows: CheckinRow[]
  lastRow: CheckinRow | null
}

function berlinDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function isTodayCheckin(row: CheckinRow, todayIso: string) {
  if (row.date === todayIso) {
    return true
  }

  if (!row.created_at) {
    return false
  }

  const createdAt = new Date(row.created_at)
  if (Number.isNaN(createdAt.getTime())) {
    return false
  }

  return berlinDayKey(createdAt) === todayIso
}

function displayMemberName(member: TrainerMemberRow) {
  const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return fullName || member.name || "Unbekannt"
}

function formatCheckinDateTime(row: CheckinRow | null) {
  if (!row) {
    return "-"
  }

  if (row.date?.trim() && row.time?.trim()) {
    return `${row.date} ${row.time}`
  }

  if (!row.created_at) {
    return row.date || "-"
  }

  const createdAt = new Date(row.created_at)
  if (Number.isNaN(createdAt.getTime())) {
    return row.date || "-"
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
  }).format(createdAt)
}

export default function TrainerProbemitgliederClient() {
  const [members, setMembers] = useState<TrainerMemberRow[]>([])
  const [checkins, setCheckins] = useState<CheckinRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deletingByMemberId, setDeletingByMemberId] = useState<Record<string, boolean>>({})

  const todayIso = useMemo(() => berlinDayKey(new Date()), [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError("")

      const [membersResponse, checkinsResponse] = await Promise.all([
        fetch("/api/trainer/members", { method: "GET" }),
        fetch("/api/admin/checkins", { method: "GET" }),
      ])

      if (!membersResponse.ok) {
        throw new Error("Probemitglieder konnten nicht geladen werden")
      }

      if (!checkinsResponse.ok) {
        throw new Error("Check-ins konnten nicht geladen werden")
      }

      const membersPayload = (await membersResponse.json().catch(() => ({}))) as MembersResponse
      const checkinsPayload = (await checkinsResponse.json().catch(() => ({}))) as CheckinsResponse

      const allMembers = Array.isArray(membersPayload.members) ? membersPayload.members : []
      const trialMembers = allMembers.filter((member) => Boolean(member.is_trial))
      const allCheckins = Array.isArray(checkinsPayload.rows) ? checkinsPayload.rows : []

      setMembers(trialMembers)
      setCheckins(allCheckins)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Daten konnten nicht geladen werden")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo<TrialMemberView[]>(() => {
    const checkinsByMemberId = new Map<string, CheckinRow[]>()

    for (const checkin of checkins) {
      const memberId = checkin.member_id || checkin.members?.id || ""
      if (!memberId) {
        continue
      }

      const existing = checkinsByMemberId.get(memberId) ?? []
      existing.push(checkin)
      checkinsByMemberId.set(memberId, existing)
    }

    const result = members.map((member) => {
      const memberCheckins = (checkinsByMemberId.get(member.id) ?? []).slice()
      memberCheckins.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })

      const todayRows = memberCheckins.filter((row) => isTodayCheckin(row, todayIso))
      const lastRow = memberCheckins[0] ?? null

      return {
        member,
        todayRows,
        lastRow,
      }
    })

    result.sort((a, b) => {
      if (a.todayRows.length > 0 && b.todayRows.length === 0) return -1
      if (a.todayRows.length === 0 && b.todayRows.length > 0) return 1
      return displayMemberName(a.member).localeCompare(displayMemberName(b.member), "de")
    })

    return result
  }, [checkins, members, todayIso])

  async function handleCheckout(memberId: string, checkinId: string) {
    const confirmed = window.confirm("Dieses Probemitglied wirklich auschecken?")
    if (!confirmed) {
      return
    }

    setDeletingByMemberId((prev) => ({ ...prev, [memberId]: true }))
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

      await loadData()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Auschecken fehlgeschlagen")
    } finally {
      setDeletingByMemberId((prev) => ({ ...prev, [memberId]: false }))
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-2xl bg-[#154c83] px-4 py-3 text-base font-semibold text-white">
          Probemitglieder heute
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <div className="text-sm text-zinc-600">Probemitglieder gesamt</div>
            <div className="text-2xl font-extrabold text-zinc-900">{rows.length}</div>
          </div>
          <Link
            href="/trainer"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Zurueck zum Dashboard
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
            Probemitglieder werden geladen...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">
            Keine Probemitglieder gefunden.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const checkedInToday = row.todayRows.length > 0
              const latestTodayCheckin = row.todayRows[0] ?? null
              const status = checkedInToday
                ? "Heute da"
                : row.lastRow
                  ? "Nicht da"
                  : "Noch kein Check-in"

              return (
                <div key={row.member.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-base font-semibold text-zinc-900">{displayMemberName(row.member)}</div>
                      <div className="mt-1 text-sm text-zinc-600">Gruppe: {row.member.base_group || "-"}</div>
                      <div className="mt-1 text-sm text-zinc-600">Status: {status}</div>
                      <div className="mt-1 text-sm text-zinc-600">Heute eingecheckt: {checkedInToday ? "Ja" : "Nein"}</div>
                      <div className="mt-1 text-sm text-zinc-600">Letzter Check-in: {formatCheckinDateTime(row.lastRow)}</div>
                    </div>

                    {checkedInToday && latestTodayCheckin ? (
                      <button
                        type="button"
                        onClick={() => void handleCheckout(row.member.id, latestTodayCheckin.id)}
                        disabled={Boolean(deletingByMemberId[row.member.id])}
                        className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        {deletingByMemberId[row.member.id] ? "Auschecken..." : "Auschecken"}
                      </button>
                    ) : null}
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
