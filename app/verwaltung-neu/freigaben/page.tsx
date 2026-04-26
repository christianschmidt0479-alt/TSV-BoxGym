"use client"

import { useEffect, useState } from "react"
import { container, pageTitle } from "@/lib/ui"
import FreigabenClient from "./FreigabenClient"

type ApprovalMember = {
  id: string
  name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  base_group: string | null
  is_trial: boolean
  is_approved: boolean
  member_phase: "trial" | "extended" | "member"
  checkin_count: number
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
    is_trial: isTrial,
    is_approved: isApproved,
    member_phase: isApproved ? "member" : isTrial ? "trial" : "extended",
    checkin_count: typeof m.checkinCount === "number" ? m.checkinCount : 0,
  }
}

export default function FreigabenPage() {
  const [members, setMembers] = useState<ApprovalMember[] | null>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/get-members", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, pageSize: 999 }),
      })
      if (!res.ok) {
        setMembers([])
        return
      }
      const result = await res.json()
      const all: Record<string, unknown>[] = result.data ?? []
      setMembers(all.filter((m) => !m.is_approved).map(toApprovalMember))
    }

    void load()
  }, [])

  return (
    <div style={container}>
      <div style={pageTitle}>Freigaben</div>
      {members === null ? (
        <p>Lade…</p>
      ) : (
        <FreigabenClient initialMembers={members} />
      )}
    </div>
  )
}

