"use client"

import Link from "next/link"
import { useState } from "react"

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
}

function getDisplayName(member: TrialMember) {
  const full = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return full || member.name || "Unbekannt"
}

function phaseLabel(phase: TrialMember["member_phase"]) {
  if (phase === "extended") return "Probemitglied verlängert"
  return "Probemitglied"
}

function phaseBadgeClass(phase: TrialMember["member_phase"]) {
  if (phase === "extended") return "inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800"
  return "inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600"
}

export default function ProbemitgliederClient({ initialMembers }: { initialMembers: TrialMember[] }) {
  const [members] = useState<TrialMember[]>(initialMembers)

  if (members.length === 0) {
    return <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">Keine Probemitglieder</div>
  }

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <div key={member.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{getDisplayName(member)}</div>
              <div className="text-xs text-zinc-500">{member.email || "Keine E-Mail"}</div>
            </div>
            <span className={phaseBadgeClass(member.member_phase)}>{phaseLabel(member.member_phase)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-700">
            <div><strong>Gruppe:</strong> {member.base_group || "-"}</div>
            <div><strong>Check-ins:</strong> {member.checkin_count}</div>
            <div><strong>Phase:</strong> {phaseLabel(member.member_phase)}</div>
            <div>
              <strong>E-Mail:</strong>{" "}
              <span className={member.email_verified ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>
                {member.email_verified ? "bestätigt" : "nicht bestätigt"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Link href={`/verwaltung-neu/mitglieder/${member.id}`}>
              <button type="button" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:border-zinc-400">
                Details anzeigen
              </button>
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
