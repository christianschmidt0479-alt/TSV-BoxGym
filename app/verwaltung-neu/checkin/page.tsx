"use client"

import { useEffect, useMemo, useState } from "react"

type TrainerMember = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  base_group?: string | null
  is_trial?: boolean | null
  is_approved?: boolean | null
  email_verified?: boolean | null
}

type MembersApiResponse = {
  data?: TrainerMember[]
  error?: string
}

type CheckinRow = {
  id: string
  member_id?: string | null
  group_name?: string | null
  checkin_mode?: string | null
  date?: string | null
  time?: string | null
  created_at?: string | null
  members?: {
    first_name?: string | null
    last_name?: string | null
    name?: string | null
    is_trial?: boolean | null
  } | null
}

type CheckinsApiResponse = {
  rows?: CheckinRow[]
  todayRows?: CheckinRow[]
}

export default function TrainerCheckinPage() {
  const [members, setMembers] = useState<TrainerMember[]>([])
  const [query, setQuery] = useState("")
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [globalError, setGlobalError] = useState("")
  const [checkins, setCheckins] = useState<CheckinRow[]>([])
  const [todayCheckins, setTodayCheckins] = useState<CheckinRow[]>([])
  const [loadingCheckins, setLoadingCheckins] = useState(true)
  const [checkinsError, setCheckinsError] = useState("")
  const [deleteLoadingById, setDeleteLoadingById] = useState<Record<string, boolean>>({})
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({})
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({})

  async function loadCheckins() {
    try {
      setLoadingCheckins(true)
      setCheckinsError("")

      const response = await fetch("/api/admin/checkins", {
        method: "GET",
      })

      const payload = (await response.json().catch(() => ({}))) as CheckinsApiResponse
      if (!response.ok) {
        throw new Error("Check-ins konnten nicht geladen werden")
      }

      const rows = Array.isArray(payload.rows) ? payload.rows : []
      const todayRows = Array.isArray(payload.todayRows) ? payload.todayRows : []
      setTodayCheckins(todayRows)
      setCheckins(rows.slice(0, 30))
    } catch (error) {
      setCheckinsError(error instanceof Error ? error.message : "Check-ins konnten nicht geladen werden")
    } finally {
      setLoadingCheckins(false)
    }
  }

  useEffect(() => {
    let active = true

    async function loadData() {
      const controller = new AbortController()

      try {
        setLoadingMembers(true)
        setLoadingCheckins(true)
        setGlobalError("")
        setCheckinsError("")

        // Parallelize both requests
        const [membersRes, checkinsRes] = await Promise.all([
          fetch("/api/admin/get-members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              page: 1,
              pageSize: 500,
              fields: ["id", "name", "first_name", "last_name", "email", "base_group", "is_trial", "is_approved", "email_verified"],
            }),
            signal: controller.signal,
          }),
          fetch("/api/admin/checkins", {
            method: "GET",
            signal: controller.signal,
          }),
        ])

        const membersJson = (await membersRes.json()) as MembersApiResponse
        const checkinsJson = (await checkinsRes.json()) as CheckinsApiResponse

        if (!active) return

        if (!membersRes.ok) {
          throw new Error(membersJson.error || "Mitglieder konnten nicht geladen werden")
        }
        if (!checkinsRes.ok) {
          throw new Error("Check-ins konnten nicht geladen werden")
        }

        setMembers(Array.isArray(membersJson.data) ? membersJson.data : [])
        setTodayCheckins(Array.isArray(checkinsJson.todayRows) ? checkinsJson.todayRows : [])
        setCheckins(Array.isArray(checkinsJson.rows) ? checkinsJson.rows.slice(0, 30) : [])
      } catch (error) {
        if (!active) return
        const errorMsg = error instanceof Error ? error.message : "Daten konnten nicht geladen werden"
        setGlobalError(errorMsg)
        setCheckinsError(errorMsg)
      } finally {
        if (active) {
          setLoadingMembers(false)
          setLoadingCheckins(false)
        }
      }
    }

    void loadData()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    // Removed: void loadCheckins() - now parallelized in first useEffect
  }, [])

  const filteredMembers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return members

    return members.filter((member) => {
      const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim().toLowerCase()
      const name = (member.name ?? "").toLowerCase()
      const email = (member.email ?? "").toLowerCase()
      return fullName.includes(needle) || name.includes(needle) || email.includes(needle)
    })
  }, [members, query])

  function displayName(member: TrainerMember) {
    const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
    return member.name?.trim() || fullName || "Unbekanntes Mitglied"
  }

  function statusLabel(member: TrainerMember) {
    if (member.is_trial) {
      return { text: "Trial", className: "bg-amber-100 text-amber-800" }
    }

    if (!member.is_approved || !member.email_verified) {
      return { text: "Nicht freigegeben", className: "bg-red-100 text-red-700" }
    }

    return { text: "Freigegeben", className: "bg-green-100 text-green-700" }
  }

  async function handleCheckin(member: TrainerMember) {
    setRowLoading((prev) => ({ ...prev, [member.id]: true }))
    setRowMessage((prev) => ({ ...prev, [member.id]: "" }))

    try {
      const res = await fetch("/api/checkin/member", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberId: member.id,
          source: "trainer",
        }),
      })

      const data = (await res.json()) as { ok?: boolean; error?: string; checkinId?: string }

      if (!res.ok || !data.ok) {
        setRowMessage((prev) => ({ ...prev, [member.id]: data.error || "Check-in fehlgeschlagen" }))
        return
      }

      setRowMessage((prev) => ({ ...prev, [member.id]: "Eingecheckt" }))
    } catch {
      setRowMessage((prev) => ({ ...prev, [member.id]: "Check-in fehlgeschlagen" }))
    } finally {
      setRowLoading((prev) => ({ ...prev, [member.id]: false }))
    }
  }

  function checkinDisplayName(row: CheckinRow) {
    const first = row.members?.first_name?.trim() ?? ""
    const last = row.members?.last_name?.trim() ?? ""
    const fullName = `${first} ${last}`.trim()
    return fullName || row.members?.name?.trim() || row.member_id || "Unbekannt"
  }

  async function handleRemoveCheckin(checkinId: string) {
    const confirmed = window.confirm("Diesen Check-in wirklich entfernen?")
    if (!confirmed) return

    setDeleteLoadingById((prev) => ({ ...prev, [checkinId]: true }))
    setCheckinsError("")

    try {
      const response = await fetch("/api/admin/checkins", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ checkinId }),
      })

      if (!response.ok) {
        throw new Error("Check-in konnte nicht entfernt werden")
      }

      await loadCheckins()
    } catch (error) {
      setCheckinsError(error instanceof Error ? error.message : "Check-in konnte nicht entfernt werden")
    } finally {
      setDeleteLoadingById((prev) => ({ ...prev, [checkinId]: false }))
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#154c83] px-4 py-4">
        <div className="text-base font-semibold text-white">Check-in Verwaltung</div>
      </div>

      <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
        <label htmlFor="trainer-search" className="mb-2 block text-sm font-medium text-zinc-700">
          Suche (Name oder E-Mail)
        </label>
        <input
          id="trainer-search"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name oder E-Mail eingeben"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      {globalError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {globalError}
        </div>
      )}

      {loadingMembers ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          Mitglieder werden geladen...
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMembers.map((member) => {
            const status = statusLabel(member)
            const message = rowMessage[member.id]
            const isLoading = rowLoading[member.id]
            const success = message === "Eingecheckt"

            return (
              <div
                key={member.id}
                className="rounded-lg border border-zinc-200 bg-white p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{displayName(member)}</div>
                    <div className="text-sm text-zinc-600">{member.email || "Keine E-Mail"}</div>
                    <div className="text-sm text-zinc-600">Gruppe: {member.base_group || "-"}</div>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-medium ${status.className}`}>
                      {status.text}
                    </span>
                  </div>

                  <div className="sm:text-right">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleCheckin(member)}
                      className="w-full rounded-md bg-[#154c83] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f3d6b] disabled:opacity-60 sm:w-auto"
                    >
                      {isLoading ? "Prüfe..." : "Einchecken"}
                    </button>

                    {message && (
                      <div className={`mt-2 text-sm ${success ? "text-green-700" : "text-red-700"}`}>
                        {message}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {!filteredMembers.length && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
              Keine Mitglieder gefunden.
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">Heute eingecheckt</h2>
        <div className="mb-3 text-sm text-zinc-600">{todayCheckins.length} Person{todayCheckins.length === 1 ? "" : "en"}</div>

        {loadingCheckins ? (
          <div className="mb-4 text-sm text-zinc-600">Check-ins werden geladen...</div>
        ) : todayCheckins.length === 0 ? (
          <div className="mb-4 text-sm text-zinc-600">Heute noch niemand eingecheckt.</div>
        ) : (
          <div className="mb-4 space-y-2">
            {todayCheckins.map((row) => (
              <div key={`today-${row.id}`} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="text-sm font-semibold text-zinc-900">{checkinDisplayName(row)}</div>
                <div className="text-xs text-zinc-600">
                  {row.date || "-"} {row.time || ""} · {row.group_name || "-"} · {row.checkin_mode || "-"}
                </div>
                <div className="text-xs text-zinc-600">Typ: {row.members?.is_trial ? "Probemitglied" : "Mitglied"}</div>
              </div>
            ))}
          </div>
        )}

        <h2 className="mb-3 text-lg font-semibold text-zinc-900">Letzte Check-ins</h2>

        {checkinsError ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {checkinsError}
          </div>
        ) : null}

        {loadingCheckins ? (
          <div className="text-sm text-zinc-600">Check-ins werden geladen...</div>
        ) : checkins.length === 0 ? (
          <div className="text-sm text-zinc-600">Keine Check-ins vorhanden.</div>
        ) : (
          <div className="space-y-2">
            {checkins.map((row) => (
              <div key={row.id} className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">{checkinDisplayName(row)}</div>
                  <div className="text-xs text-zinc-600">
                    {row.date || "-"} {row.time || ""} · {row.group_name || "-"} · {row.checkin_mode || "-"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleRemoveCheckin(row.id)}
                  disabled={Boolean(deleteLoadingById[row.id])}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {deleteLoadingById[row.id] ? "Entferne..." : "Entfernen"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
