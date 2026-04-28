"use client"

import Link from "next/link"
import { useState } from "react"
import { loadGsStatusMap, type GsStatusEntry, type GsStatus } from "../gs-abgleich/gsStatusStore"

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
}

function getDisplayName(member: ApprovalMember) {
  const full = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return full || member.name || "Unbekannt"
}

function statusBadgeClass(status: ApprovalMember["member_phase"]) {
  if (status === "member") return "inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"
  if (status === "extended") return "inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800"
  return "inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600"
}

function statusLabel(status: ApprovalMember["member_phase"]) {
  if (status === "member") return "Freigegeben"
  if (status === "extended") return "Verlängert"
  return "Offen"
}


function gsBadgeProps(entry?: GsStatusEntry) {
  if (!entry) return { color: "bg-zinc-200 text-zinc-600", title: "GS: noch nicht geprüft" }
  if (entry.status === "match") return { color: "bg-emerald-500 text-white", title: "GS: Mitglied gefunden" }
  if (entry.status === "mismatch") return { color: "bg-amber-400 text-white", title: "GS: Name gefunden, Geburtsdatum prüfen" }
  if (entry.status === "not_found") return { color: "bg-red-500 text-white", title: "GS: nicht in GS-Liste gefunden" }
  return { color: "bg-zinc-200 text-zinc-600", title: "GS: noch nicht geprüft" }
}

function approvalHintText(status?: GsStatus) {
  if (status === "not_found") return "Warnung: Mitglied wurde im TSV-Abgleich nicht gefunden. Freigabe wird trotzdem ausgeführt."
  if (status === "mismatch") return "Hinweis: TSV-Abgleich meldet Namens-Treffer mit abweichendem Geburtsdatum. Freigabe wird trotzdem ausgeführt."
  return null
}

export default function FreigabenClient({ initialMembers }: { initialMembers: ApprovalMember[] }) {
  const [members, setMembers] = useState<ApprovalMember[]>(initialMembers)
  const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tsvStatusMap] = useState<Record<string, GsStatusEntry>>(() => loadGsStatusMap())

  async function callAction(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const result = await response.json().catch(() => ({ ok: false, error: "Unbekannter Fehler" }))
    if (!response.ok || !result.ok) {
      throw new Error(result?.error || "Aktion fehlgeschlagen")
    }
    return result
  }

  async function approveMember(member: ApprovalMember) {
    const baseGroup = member.base_group || ""
    if (!baseGroup) {
      setError("Bitte zuerst unter \"Daten ändern\" eine Stammgruppe setzen.")
      return
    }

    const gsEntry = tsvStatusMap[member.id]
    const hint = approvalHintText(gsEntry?.status)
    if (hint) {
      window.alert(hint)
    }

    setError(null)
    setLoadingMemberId(member.id)
    try {
      await callAction("/api/admin/member-action", {
        action: "approve",
        memberId: member.id,
        baseGroup,
      })

      setMembers((prev) =>
        prev.filter((row) => row.id !== member.id)
      )
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Freigabe fehlgeschlagen")
    } finally {
      setLoadingMemberId(null)
    }
  }

  if (members.length === 0) {
    return <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">Keine offenen Freigaben</div>
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {members.map((member) => {
          const status = member.member_phase

        const gsEntry = tsvStatusMap[member.id]
        const isBusy = loadingMemberId === member.id

        return (
          <div key={member.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{getDisplayName(member)}</div>
                <div className="text-xs text-zinc-500">{member.email || "Keine E-Mail"}</div>
              </div>
              {/* Kompakter GS-Badge */}
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold border border-zinc-300 shadow-sm cursor-default ${gsBadgeProps(gsEntry).color}`}
                title={gsBadgeProps(gsEntry).title}
                style={{ minWidth: 28, justifyContent: "center" }}
              >
                GS
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-700">
              <div><strong>Gruppe:</strong> {member.base_group || "-"}</div>
              <div><strong>Check-ins:</strong> {member.checkin_count}</div>
              <div>
                <strong>E-Mail:</strong>{" "}
                <span className={member.email_verified ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>
                  {member.email_verified ? "bestätigt" : "nicht bestätigt"}
                </span>
              </div>
            </div>

            {approvalHintText(gsEntry?.status) ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {approvalHintText(gsEntry?.status)}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/verwaltung-neu/mitglieder/${member.id}`}>
                <button type="button" disabled={isBusy} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 disabled:opacity-60">
                  Daten ändern
                </button>
              </Link>

              <button
                type="button"
                onClick={() => approveMember(member)}
                disabled={isBusy}
                className="rounded-md bg-[#154c83] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f3d6b] disabled:opacity-60"
              >
                {isBusy ? "Freigeben…" : "Freigeben"}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
