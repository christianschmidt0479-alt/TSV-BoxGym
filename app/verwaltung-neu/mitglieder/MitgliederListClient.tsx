"use client"
import { useEffect, useMemo, useState } from "react"
import { card, cardTitle, buttonSecondary } from "@/lib/ui"
import Link from "next/link"

type MemberRow = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  base_group?: string | null
  office_list_group?: string | null
  is_trial?: boolean | null
  is_approved?: boolean | null
  email_verified?: boolean | null
  checkinCount?: number
  checkedInToday?: boolean
}

function memberName(member: MemberRow) {
  return (member.name || `${member.first_name || ""} ${member.last_name || ""}`).trim() || "Unbekannt"
}

function memberStatus(member: MemberRow) {
  if (member.is_trial) return "Probemitglied"
  if (!member.is_approved) return "Mitglied - Prüfung offen"
  return "Freigegeben"
}

function limitFor(member: MemberRow) {
  return member.is_trial ? 3 : 8
}

function hasReachedLimit(member: MemberRow) {
  const count = member.checkinCount ?? 0
  if (member.is_trial && count >= 3) return true
  if (!member.is_trial && !member.is_approved && count >= 8) return true
  return false
}

function isLastTrainingBeforeBlock(member: MemberRow) {
  const count = member.checkinCount ?? 0
  return !member.is_trial && !member.is_approved && count >= 7
}

function priority(member: MemberRow) {
  const count = member.checkinCount ?? 0
  if (!member.is_approved && count >= 7) {
    return { label: "dringend", color: "#dc2626", bg: "#fee2e2" }
  }
  if (!member.is_approved && count >= 5) {
    return { label: "bald prüfen", color: "#b45309", bg: "#fef3c7" }
  }
  return { label: "normal", color: "#6b7280", bg: "#f3f4f6" }
}

function sortBucket(member: MemberRow) {
  const count = member.checkinCount ?? 0

  // 1) HEUTE DA + kritisch (>=7)
  if (member.checkedInToday && count >= 7) return 1

  // 2) HEUTE DA + nicht freigegeben
  if (member.checkedInToday && !member.is_approved) return 2

  // 3) HEUTE DA (Rest)
  if (member.checkedInToday) return 3

  // 4) nicht freigegeben (Rest)
  if (!member.is_approved) return 4

  // 5) Rest
  return 5
}

export default function MitgliederListClient({ members }: { members: MemberRow[] }) {
  const [localMembers, setLocalMembers] = useState<MemberRow[]>(members)
  const [search, setSearch] = useState("")
  const [groupFilter, setGroupFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [approvingById, setApprovingById] = useState<Record<string, boolean>>({})
  const [messageById, setMessageById] = useState<Record<string, { type: "success" | "error"; text: string }>>({})

  useEffect(() => {
    setLocalMembers(members)
  }, [members])

  const filteredMembers = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim()

    return localMembers.filter((m) => {
      const fullName = memberName(m).toLowerCase()
      const email = (m.email || "").toLowerCase()

      const matchSearch =
        normalizedSearch.length < 1 ||
        fullName.includes(normalizedSearch) ||
        email.includes(normalizedSearch)

      const matchGroup =
        groupFilter === "all" || m.base_group === groupFilter

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "approved" && Boolean(m.is_approved)) ||
        (statusFilter === "pending" && !m.is_approved)

      return matchSearch && matchGroup && matchStatus
    })
  }, [localMembers, search, groupFilter, statusFilter])

  const sortedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      const bucketDiff = sortBucket(a) - sortBucket(b)
      if (bucketDiff !== 0) return bucketDiff

      const countDiff = (b.checkinCount ?? 0) - (a.checkinCount ?? 0)
      if (countDiff !== 0) return countDiff

      return memberName(a).localeCompare(memberName(b), "de")
    })
  }, [filteredMembers])

  const todayMembers = useMemo(() => sortedMembers.filter((member) => Boolean(member.checkedInToday)), [sortedMembers])
  const notTodayMembers = useMemo(() => sortedMembers.filter((member) => !member.checkedInToday), [sortedMembers])
  const criticalTodayMembers = useMemo(
    () => todayMembers.filter((member) => (member.checkinCount ?? 0) >= 7),
    [todayMembers]
  )
  const totalTodayCount = useMemo(() => localMembers.filter((member) => Boolean(member.checkedInToday)).length, [localMembers])
  const totalCriticalCount = useMemo(() => localMembers.filter((member) => (member.checkinCount ?? 0) >= 7).length, [localMembers])
  const totalOpenCount = useMemo(() => localMembers.filter((member) => !member.is_approved).length, [localMembers])

  async function handleDelete(memberId: string) {
    if (!confirm("Mitglied wirklich löschen?")) return

    const res = await fetch("/api/admin/delete-member", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    })

    if (!res.ok) {
      alert("Löschen fehlgeschlagen")
      return
    }

    setLocalMembers((prev) => prev.filter((m) => m.id !== memberId))
  }

  async function handleApprove(member: MemberRow) {
    setApprovingById((prev) => ({ ...prev, [member.id]: true }))
    setMessageById((prev) => {
      const next = { ...prev }
      delete next[member.id]
      return next
    })

    try {
      const response = await fetch("/api/admin/member-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.id,
          action: "approve",
          // Existing endpoint still requires baseGroup; memberId/action remain the primary payload.
          baseGroup: member.base_group || "",
        }),
      })

      const data = (await response.json()) as { ok?: boolean; error?: string; member?: { is_approved?: boolean } }

      if (!response.ok || !data.ok) {
        setMessageById((prev) => ({
          ...prev,
          [member.id]: {
            type: "error",
            text: data.error || "Freigabe fehlgeschlagen",
          },
        }))
        return
      }

      setLocalMembers((prev) =>
        prev.map((row) =>
          row.id === member.id
            ? {
                ...row,
                is_approved: true,
              }
            : row
        )
      )

      setMessageById((prev) => ({
        ...prev,
        [member.id]: {
          type: "success",
          text: "Freigegeben",
        },
      }))
    } catch {
      setMessageById((prev) => ({
        ...prev,
        [member.id]: {
          type: "error",
          text: "Freigabe fehlgeschlagen",
        },
      }))
    } finally {
      setApprovingById((prev) => ({ ...prev, [member.id]: false }))
    }
  }

  return (
    <>
      <div
        style={{
          marginBottom: 12,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        <div style={{ ...card, marginBottom: 0, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Teilnehmer heute</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{totalTodayCount}</div>
        </div>
        <div style={{ ...card, marginBottom: 0, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{"kritisch (>=7)"}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#b91c1c" }}>{totalCriticalCount}</div>
        </div>
        <div style={{ ...card, marginBottom: 0, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>offen (!is_approved)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#b45309" }}>{totalOpenCount}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          placeholder="Name oder E-Mail suchen"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", minWidth: 260 }}
        />

        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px" }}
        >
          <option value="all">Alle Gruppen</option>
          <option value="Basic 10 - 14 Jahre">Basic 10 - 14</option>
          <option value="Basic 15 - 18 Jahre">Basic 15 - 18</option>
          <option value="Basic Ü18">Basic Ü18</option>
          <option value="L-Gruppe">L-Gruppe</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px" }}
        >
          <option value="all">Alle</option>
          <option value="approved">Freigegeben</option>
          <option value="pending">Offen</option>
        </select>
      </div>

      {criticalTodayMembers.length > 0 && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#fee2e2",
            color: "#991b1b",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          🔴 Kritisch heute ({criticalTodayMembers.length})
        </div>
      )}

      <div
        style={{
          marginBottom: 12,
          padding: "8px 12px",
          borderRadius: 10,
          background: "#ecfdf5",
          color: "#065f46",
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        Heute im Training ({todayMembers.length})
      </div>

      {todayMembers.map((m) => (
        <div key={m.id} style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
            <div>
              <div style={cardTitle}>{memberName(m)}</div>
              <div style={{ fontSize: 14, color: "#666", marginBottom: 6 }}>{m.email || "-"}</div>
              <div style={{ fontSize: 14, color: "#334155" }}>Gruppe: {m.base_group || "-"}</div>
            </div>
            {!m.is_approved ? (
              <div
                style={{
                  minWidth: 120,
                  textAlign: "right",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: priority(m).color,
                    background: priority(m).bg,
                  }}
                >
                  {priority(m).color === "#dc2626" ? "ROT" : priority(m).color === "#b45309" ? "GELB" : "GRAU"} {priority(m).label}
                </span>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "#111827" }}>
            <strong>Status:</strong> {memberStatus(m)}
          </div>

          <div style={{ marginTop: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 700,
                color: m.checkedInToday ? "#166534" : "#4b5563",
                background: m.checkedInToday ? "#dcfce7" : "#e5e7eb",
              }}
            >
              {m.checkedInToday ? "HEUTE DA" : "nicht da"}
            </span>
          </div>

          <div style={{ marginTop: 6, fontSize: 13, color: m.email_verified ? "#15803d" : "#b91c1c", fontWeight: 600 }}>
            {m.email_verified ? "✔ E-Mail bestätigt" : "⚠ E-Mail nicht bestätigt"}
          </div>

          {!m.email_verified && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#7c2d12", fontWeight: 700 }}>
              🆕 Neu / Registrierung unvollständig
            </div>
          )}

          {!m.is_approved && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#b45309", fontWeight: 600 }}>
              ⚠ Mitgliederprüfung offen
            </div>
          )}

          {m.email_verified && !m.is_approved && (m.checkinCount ?? 0) >= 5 && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#1d4ed8", fontWeight: 700 }}>
              👉 Empfehlung: Freigabe prüfen
            </div>
          )}

          {m.base_group && m.office_list_group && m.base_group !== m.office_list_group && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#b91c1c", fontWeight: 700 }}>
              ⚠ Gruppenabweichung
            </div>
          )}

          <div style={{ marginTop: 6, fontSize: 13, color: isLastTrainingBeforeBlock(m) ? "#b91c1c" : "#111827", fontWeight: isLastTrainingBeforeBlock(m) ? 700 : 400 }}>
            <strong>{isLastTrainingBeforeBlock(m) ? "🔥" : "Checkins:"}</strong> {m.checkinCount ?? 0} / {limitFor(m)}{isLastTrainingBeforeBlock(m) ? " Trainings" : ""}
          </div>

          {isLastTrainingBeforeBlock(m) && (
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>
              🔴 Letztes Training vor Sperre
            </div>
          )}

          {hasReachedLimit(m) && (
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>
              Limit erreicht
            </div>
          )}

          {messageById[m.id] ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: 600,
                color: messageById[m.id].type === "success" ? "#15803d" : "#b91c1c",
              }}
            >
              {messageById[m.id].text}
            </div>
          ) : null}

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => void handleDelete(m.id)}
              style={{ background: "transparent", border: "none", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Löschen
            </button>
            {!m.is_approved && (
              <button
                style={buttonSecondary}
                onClick={() => void handleApprove(m)}
                disabled={Boolean(approvingById[m.id])}
              >
                {approvingById[m.id] ? "Freigabe..." : "Freigeben"}
              </button>
            )}
            <Link href={`/verwaltung-neu/mitglieder/${m.id}/demo`}>
              <button style={buttonSecondary}>Details</button>
            </Link>
          </div>
        </div>
      ))}

      <div
        style={{
          marginTop: 8,
          marginBottom: 12,
          padding: "8px 12px",
          borderRadius: 10,
          background: "#f3f4f6",
          color: "#374151",
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        Nicht im Training ({notTodayMembers.length})
      </div>

      {notTodayMembers.map((m) => (
        <div key={m.id} style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
            <div>
              <div style={cardTitle}>{memberName(m)}</div>
              <div style={{ fontSize: 14, color: "#666", marginBottom: 6 }}>{m.email || "-"}</div>
              <div style={{ fontSize: 14, color: "#334155" }}>Gruppe: {m.base_group || "-"}</div>
            </div>
            {!m.is_approved ? (
              <div
                style={{
                  minWidth: 120,
                  textAlign: "right",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: priority(m).color,
                    background: priority(m).bg,
                  }}
                >
                  {priority(m).color === "#dc2626" ? "ROT" : priority(m).color === "#b45309" ? "GELB" : "GRAU"} {priority(m).label}
                </span>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "#111827" }}>
            <strong>Status:</strong> {memberStatus(m)}
          </div>

          <div style={{ marginTop: 6, fontSize: 13, color: m.email_verified ? "#15803d" : "#b91c1c", fontWeight: 600 }}>
            {m.email_verified ? "✔ E-Mail bestätigt" : "⚠ E-Mail nicht bestätigt"}
          </div>

          {!m.email_verified && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#7c2d12", fontWeight: 700 }}>
              🆕 Neu / Registrierung unvollständig
            </div>
          )}

          {!m.is_approved && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#b45309", fontWeight: 600 }}>
              ⚠ Mitgliederprüfung offen
            </div>
          )}

          {m.email_verified && !m.is_approved && (m.checkinCount ?? 0) >= 5 && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#1d4ed8", fontWeight: 700 }}>
              👉 Empfehlung: Freigabe prüfen
            </div>
          )}

          {m.base_group && m.office_list_group && m.base_group !== m.office_list_group && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#b91c1c", fontWeight: 700 }}>
              ⚠ Gruppenabweichung
            </div>
          )}

          <div style={{ marginTop: 6, fontSize: 13, color: isLastTrainingBeforeBlock(m) ? "#b91c1c" : "#111827", fontWeight: isLastTrainingBeforeBlock(m) ? 700 : 400 }}>
            <strong>{isLastTrainingBeforeBlock(m) ? "🔥" : "Checkins:"}</strong> {m.checkinCount ?? 0} / {limitFor(m)}{isLastTrainingBeforeBlock(m) ? " Trainings" : ""}
          </div>

          {isLastTrainingBeforeBlock(m) && (
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>
              🔴 Letztes Training vor Sperre
            </div>
          )}

          {hasReachedLimit(m) && (
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>
              Limit erreicht
            </div>
          )}

          {messageById[m.id] ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: 600,
                color: messageById[m.id].type === "success" ? "#15803d" : "#b91c1c",
              }}
            >
              {messageById[m.id].text}
            </div>
          ) : null}

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => void handleDelete(m.id)}
              style={{ background: "transparent", border: "none", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Löschen
            </button>
            {!m.is_approved && (
              <button
                style={buttonSecondary}
                onClick={() => void handleApprove(m)}
                disabled={Boolean(approvingById[m.id])}
              >
                {approvingById[m.id] ? "Freigabe..." : "Freigeben"}
              </button>
            )}
            <Link href={`/verwaltung-neu/mitglieder/${m.id}/demo`}>
              <button style={buttonSecondary}>Details</button>
            </Link>
          </div>
        </div>
      ))}
    </>
  )
}