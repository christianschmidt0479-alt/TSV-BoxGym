"use client"

import { useEffect, useState } from "react"

import ProbemitgliederClient from "./ProbemitgliederClient"

type TrialMember = {
  id: string
  name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  base_group: string | null
  email_verified: boolean
  is_trial: boolean
  is_approved: boolean
  member_phase: "trial" | "extended" | "member"
  checkin_count: number
  office_list_status: string | null
  office_list_group: string | null
  office_list_checked_at: string | null
}

function toTrialMember(m: Record<string, unknown>): TrialMember {
  return {
    id: String(m.id),
    name: typeof m.name === "string" ? m.name : null,
    first_name: typeof m.first_name === "string" ? m.first_name : null,
    last_name: typeof m.last_name === "string" ? m.last_name : null,
    email: typeof m.email === "string" ? m.email : null,
    base_group: typeof m.base_group === "string" ? m.base_group : null,
    email_verified: Boolean(m.email_verified),
    is_trial: Boolean(m.is_trial),
    is_approved: Boolean(m.is_approved),
    member_phase:
      m.member_phase === "trial" || m.member_phase === "extended" ? m.member_phase : "trial",
    checkin_count: typeof m.checkinCount === "number" ? m.checkinCount : 0,
    office_list_status: typeof m.office_list_status === "string" ? m.office_list_status : null,
    office_list_group: typeof m.office_list_group === "string" ? m.office_list_group : null,
    office_list_checked_at: typeof m.office_list_checked_at === "string" ? m.office_list_checked_at : null,
  }
}

export default function ProbemitgliederPage() {
  const [members, setMembers] = useState<TrialMember[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      const res = await fetch("/api/admin/get-members", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: 1,
          pageSize: 999,
          fields: [
            "id",
            "name",
            "first_name",
            "last_name",
            "email",
            "base_group",
            "email_verified",
            "is_trial",
            "is_approved",
            "member_phase",
            "office_list_status",
            "office_list_group",
            "office_list_checked_at",
          ],
          includeTodayTotal: false,
          includePendingCount: false,
          includeCheckedInToday: false,
        }),
      })
      if (!res.ok) {
        setMembers([])
        return
      }
      const result = await res.json()
      const all: Record<string, unknown>[] = result.data ?? []
      const trial = all.filter((m) => m.member_phase === "trial" || m.member_phase === "extended")

      setMembers(trial.map(toTrialMember))
    }

    void load().catch((err: unknown) => {
      if (err instanceof Error && err.name === "AbortError") {
        return
      }

      console.error(err)
      setMembers([])
    })

    return () => {
      controller.abort()
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="text-base font-semibold text-zinc-900">Probemitglieder</div>
        <div className="text-sm text-zinc-600">Probetraining-Übersicht</div>
      </div>
      {members === null ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">Lade…</div>
      ) : (
        <ProbemitgliederClient initialMembers={members} />
      )}
    </div>
  )
}
