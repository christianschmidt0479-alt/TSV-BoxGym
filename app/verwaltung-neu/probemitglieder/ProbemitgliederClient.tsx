"use client"

import Link from "next/link"
import { useState } from "react"
import { groupOptions } from "@/lib/boxgymSessions"
import { buttonSecondary, card, cardTitle } from "@/lib/ui"

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

function phaseColor(phase: TrialMember["member_phase"]) {
  if (phase === "extended") {
    return { background: "#fef9c3", color: "#854d0e", border: "1px solid #fde047" }
  }
  return { background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db" }
}

export default function ProbemitgliederClient({ initialMembers }: { initialMembers: TrialMember[] }) {
  const [members] = useState<TrialMember[]>(initialMembers)

  if (members.length === 0) {
    return <p>Keine Probemitglieder</p>
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {members.map((member) => (
        <div key={member.id} style={{ ...card, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={cardTitle}>{getDisplayName(member)}</div>
              <div style={{ color: "#64748b", fontSize: 14 }}>{member.email || "Keine E-Mail"}</div>
            </div>
            <span style={{ ...phaseColor(member.member_phase), borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
              {phaseLabel(member.member_phase)}
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
              <strong>Phase:</strong> {phaseLabel(member.member_phase)}
            </div>
            <div>
              <strong>E-Mail:</strong> {member.email_verified ? "bestätigt" : "nicht bestätigt"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {member.email_verified ? (
              <span style={{ color: "#15803d", fontWeight: 600 }}>E-Mail bestätigt</span>
            ) : (
              <span style={{ color: "#dc2626", fontWeight: 600 }}>E-Mail nicht bestätigt</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Link href={`/verwaltung-neu/mitglieder/${member.id}`} style={{ textDecoration: "none" }}>
              <button type="button" style={buttonSecondary}>
                Details anzeigen
              </button>
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
