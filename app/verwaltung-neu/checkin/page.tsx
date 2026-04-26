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

export default function TrainerCheckinPage() {
  const [members, setMembers] = useState<TrainerMember[]>([])
  const [query, setQuery] = useState("")
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [globalError, setGlobalError] = useState("")
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({})
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true

    async function loadMembers() {
      try {
        setLoadingMembers(true)
        setGlobalError("")

        const res = await fetch("/api/admin/get-members", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            page: 1,
            pageSize: 2000,
          }),
        })

        const json = (await res.json()) as MembersApiResponse
        if (!res.ok) {
          throw new Error(json.error || "Mitglieder konnten nicht geladen werden")
        }

        if (!active) return
        setMembers(Array.isArray(json.data) ? json.data : [])
      } catch (error) {
        if (!active) return
        setGlobalError(error instanceof Error ? error.message : "Mitglieder konnten nicht geladen werden")
      } finally {
        if (active) {
          setLoadingMembers(false)
        }
      }
    }

    void loadMembers()

    return () => {
      active = false
    }
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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Trainer Check-in</h1>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <label htmlFor="trainer-search" className="mb-2 block text-sm font-medium text-slate-700">
          Suche (Name oder E-Mail)
        </label>
        <input
          id="trainer-search"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name oder E-Mail eingeben"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      {globalError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {globalError}
        </div>
      )}

      {loadingMembers ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
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
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-slate-900">{displayName(member)}</div>
                    <div className="text-sm text-slate-600">{member.email || "Keine E-Mail"}</div>
                    <div className="text-sm text-slate-600">Gruppe: {member.base_group || "-"}</div>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-medium ${status.className}`}>
                      {status.text}
                    </span>
                  </div>

                  <div className="sm:text-right">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleCheckin(member)}
                      className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
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
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Keine Mitglieder gefunden.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
