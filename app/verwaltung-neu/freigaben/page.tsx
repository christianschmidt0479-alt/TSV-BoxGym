"use client"

import { useEffect, useState } from "react"

import FreigabenClient from "./FreigabenClient"

type ApprovalMember = {
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
  last_verification_sent_at: string | null
  office_list_status: string | null
  office_list_group: string | null
  office_list_checked_at: string | null
}

function toApprovalMember(m: Record<string, unknown>): ApprovalMember {
  const isApproved = Boolean(m.is_approved)
  const isTrial = Boolean(m.is_trial)

  return {
    id: String(m.id),
    name: typeof m.name === "string" ? m.name : null,
    first_name: typeof m.first_name === "string" ? m.first_name : null,
    last_name: typeof m.last_name === "string" ? m.last_name : null,
    email: typeof m.email === "string" ? m.email : null,
    base_group: typeof m.base_group === "string" ? m.base_group : null,
    email_verified: Boolean(m.email_verified),
    is_trial: isTrial,
    is_approved: isApproved,
    member_phase: m.member_phase === "trial" || m.member_phase === "extended" || m.member_phase === "member"
      ? m.member_phase
      : "member",
    checkin_count: typeof m.checkinCount === "number" ? m.checkinCount : 0,
    last_verification_sent_at:
      typeof m.last_verification_sent_at === "string" ? m.last_verification_sent_at : null,
    office_list_status: typeof m.office_list_status === "string" ? m.office_list_status : null,
    office_list_group: typeof m.office_list_group === "string" ? m.office_list_group : null,
    office_list_checked_at: typeof m.office_list_checked_at === "string" ? m.office_list_checked_at : null,
  }
}

export default function FreigabenPage() {
  const [members, setMembers] = useState<ApprovalMember[] | null>(null)

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
            "last_verification_sent_at",
            "office_list_status",
            "office_list_group",
            "office_list_checked_at",
            "is_trial",
            "is_approved",
            "member_phase",
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
      const pending = all.filter((m) => !m.is_approved && m.member_phase === "member")

      setMembers(pending.map(toApprovalMember))
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
        <div className="text-base font-semibold text-zinc-900">Freigaben</div>
        <div className="text-sm text-zinc-600">Neue Mitglieder prüfen und freigeben</div>
      </div>
      {members === null ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">Lade…</div>
      ) : (
        <FreigabenClient initialMembers={members} />
      )}
    </div>
  )
}

