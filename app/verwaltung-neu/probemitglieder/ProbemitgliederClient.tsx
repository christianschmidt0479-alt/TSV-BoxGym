"use client"

import Link from "next/link"
import { useState } from "react"
import { OfficeMatchBadge } from "@/components/verwaltung-neu/OfficeMatchBadge"

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
  const [members, setMembers] = useState<TrialMember[]>(initialMembers)
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function moveToApprovals(member: TrialMember) {
    const confirmed = confirm("Probemitglied wirklich in die Freigaben übernehmen? Es wird noch nicht freigegeben.")
    if (!confirmed) return

    setBusyMemberId(member.id)
    setError(null)
    setInfo(null)

    try {
      const response = await fetch("/api/admin/member-action", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "move_to_approvals",
          memberId: member.id,
        }),
      })

      const payload = await response.json().catch(() => ({ ok: false, error: "Übernahme fehlgeschlagen." }))

      if (!response.ok || !payload.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Übernahme fehlgeschlagen.")
      }

      setMembers((previous) => previous.filter((entry) => entry.id !== member.id))
      setInfo("Probemitglied wurde in Freigaben übernommen.")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Übernahme fehlgeschlagen.")
    } finally {
      setBusyMemberId(null)
    }
  }

  return (
    <div className="space-y-3">
      {info ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {info}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {members.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">Keine Probemitglieder</div>
      ) : null}

      {members.map((member) => (
        <div key={member.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{getDisplayName(member)}</div>
              <div className="text-xs text-zinc-500">{member.email || "Keine E-Mail"}</div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className={phaseBadgeClass(member.member_phase)}>{phaseLabel(member.member_phase)}</span>
              <OfficeMatchBadge
                status={member.office_list_status}
                baseGroup={member.base_group}
                officeGroup={member.office_list_group}
                checkedAt={member.office_list_checked_at}
                compact
              />
            </div>
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

            {(member.member_phase === "trial" || member.member_phase === "extended") ? (
              <button
                type="button"
                disabled={busyMemberId === member.id}
                onClick={() => {
                  void moveToApprovals(member)
                }}
                className="rounded-md bg-[#154c83] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#123d69] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyMemberId === member.id ? "Übernehme..." : "In Freigaben übernehmen"}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
