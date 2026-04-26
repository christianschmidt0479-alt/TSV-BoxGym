"use client"

import { useMemo, useState } from "react"
import { groupOptions } from "@/lib/boxgymSessions"
import { buttonPrimary, buttonSecondary, card, cardTitle } from "@/lib/ui"

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

function getDisplayName(member: ApprovalMember) {
  const full = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return full || member.name || "Unbekannt"
}

function statusColor(status: ApprovalMember["member_phase"]) {
  if (status === "member") {
    return { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }
  }
  if (status === "extended") {
    return { background: "#fef9c3", color: "#854d0e", border: "1px solid #fde047" }
  }
  return { background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db" }
}

export default function FreigabenClient({ initialMembers }: { initialMembers: ApprovalMember[] }) {
  const [members, setMembers] = useState<ApprovalMember[]>(initialMembers)
  const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const groupByMemberId = useMemo(() => {
    const next = new Map<string, string>()
    for (const member of members) {
      next.set(member.id, member.base_group || groupOptions[0] || "")
    }
    return next
  }, [members])

  const [selectedGroups, setSelectedGroups] = useState<Map<string, string>>(groupByMemberId)

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
    const baseGroup = selectedGroups.get(member.id) || member.base_group || ""
    if (!baseGroup) {
      setError("Bitte zuerst eine Gruppe auswählen.")
      return
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
        prev.map((row) =>
          row.id === member.id
            ? {
                ...row,
                base_group: baseGroup,
                is_approved: true,
                member_phase: "member",
              }
            : row
        )
      )
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Freigabe fehlgeschlagen")
    } finally {
      setLoadingMemberId(null)
    }
  }

  async function changeGroup(member: ApprovalMember) {
    const baseGroup = selectedGroups.get(member.id) || member.base_group || ""
    if (!baseGroup) {
      setError("Bitte zuerst eine Gruppe auswählen.")
      return
    }

    setError(null)
    setLoadingMemberId(member.id)
    try {
      await callAction("/api/admin/member-action", {
        action: "change_group",
        memberId: member.id,
        baseGroup,
      })

      setMembers((prev) =>
        prev.map((row) => (row.id === member.id ? { ...row, base_group: baseGroup } : row))
      )
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Gruppenänderung fehlgeschlagen")
    } finally {
      setLoadingMemberId(null)
    }
  }

  async function extendTrial(member: ApprovalMember) {
    setError(null)
    setLoadingMemberId(member.id)
    try {
      await callAction("/api/trainer/extend-member", {
        memberId: member.id,
      })

      setMembers((prev) =>
        prev.map((row) =>
          row.id === member.id
            ? {
                ...row,
                member_phase: "extended",
              }
            : row
        )
      )
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Trial-Verlängerung fehlgeschlagen")
    } finally {
      setLoadingMemberId(null)
    }
  }

  if (members.length === 0) {
    return <p>Keine offenen Freigaben</p>
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error ? (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", color: "#991b1b", padding: 12, borderRadius: 8 }}>
          {error}
        </div>
      ) : null}

      {members.map((member) => {
        const currentGroup = selectedGroups.get(member.id) || member.base_group || ""
        const status = member.member_phase
        const isBusy = loadingMemberId === member.id

        return (
          <div key={member.id} style={{ ...card, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={cardTitle}>{getDisplayName(member)}</div>
                <div style={{ color: "#64748b", fontSize: 14 }}>{member.email || "Keine E-Mail"}</div>
              </div>
              <span style={{ ...statusColor(status), borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
                {status}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, fontSize: 14 }}>
              <div>
                <strong>Gruppe:</strong> {member.base_group || "-"}
              </div>
              <div>
                <strong>Check-ins:</strong> {member.checkin_count}
              </div>
              <div>
                <strong>member_phase:</strong> {member.member_phase}
              </div>
              <div>
                <strong>Status:</strong> {status}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={currentGroup}
                onChange={(event) => {
                  const next = new Map(selectedGroups)
                  next.set(member.id, event.target.value)
                  setSelectedGroups(next)
                }}
                disabled={isBusy}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", minWidth: 220 }}
              >
                <option value="">Gruppe wählen</option>
                {groupOptions.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>

              <button
                type="button"
                style={buttonPrimary}
                onClick={() => approveMember(member)}
                disabled={isBusy}
              >
                Freigeben
              </button>

              <button
                type="button"
                style={buttonSecondary}
                onClick={() => changeGroup(member)}
                disabled={isBusy}
              >
                Gruppe ändern
              </button>

              <button
                type="button"
                style={buttonSecondary}
                onClick={() => extendTrial(member)}
                disabled={isBusy}
              >
                Trial verlängern
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
