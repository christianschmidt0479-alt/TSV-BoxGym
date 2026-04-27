"use client"
import { useEffect, useMemo, useState } from "react"
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
  member_phase?: "trial" | "extended" | "member"
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

function priorityBadge(m: MemberRow) {
  const p = priority(m)
  if (p.color === "#dc2626") return "inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700"
  if (p.color === "#b45309") return "inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700"
  return "inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-500"
}

function priorityLabel(m: MemberRow) {
  const p = priority(m)
  if (p.color === "#dc2626") return `ROT · ${p.label}`
  if (p.color === "#b45309") return `GELB · ${p.label}`
  return p.label
}

function MemberCard({ m }: { m: MemberRow }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">{memberName(m)}</div>
          <div className="text-xs text-zinc-500">{m.email || "-"}</div>
          <div className="text-xs text-zinc-600">Gruppe: {m.base_group || "-"}</div>
        </div>
        {!m.is_approved ? (
          <span className={priorityBadge(m)}>{priorityLabel(m)}</span>
        ) : null}
      </div>

      <div className="text-xs text-zinc-700"><strong>Status:</strong> {memberStatus(m)}</div>

      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${m.checkedInToday ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
          {m.checkedInToday ? "HEUTE DA" : "nicht da"}
        </span>
        <span className={`text-xs font-semibold ${m.email_verified ? "text-emerald-700" : "text-red-700"}`}>
          {m.email_verified ? "✔ E-Mail bestätigt" : "⚠ E-Mail nicht bestätigt"}
        </span>
      </div>

      {!m.email_verified && (
        <div className="text-xs font-bold text-orange-800">🆕 Neu / Registrierung unvollständig</div>
      )}
      {!m.is_approved && (
        <div className="text-xs font-semibold text-amber-700">⚠ Mitgliederprüfung offen</div>
      )}
      {m.email_verified && !m.is_approved && (m.checkinCount ?? 0) >= 5 && (
        <div className="text-xs font-bold text-blue-700">👉 Empfehlung: Freigabe prüfen</div>
      )}
      {m.base_group && m.office_list_group && m.base_group !== m.office_list_group && (
        <div className="text-xs font-bold text-red-700">⚠ Gruppenabweichung</div>
      )}

      <div className={`text-xs font-semibold ${isLastTrainingBeforeBlock(m) ? "text-red-700 font-bold" : "text-zinc-700"}`}>
        {isLastTrainingBeforeBlock(m) ? "🔥" : ""} <strong>Checkins:</strong> {m.checkinCount ?? 0} / {limitFor(m)}{isLastTrainingBeforeBlock(m) ? " Trainings" : ""}
      </div>
      {isLastTrainingBeforeBlock(m) && (
        <div className="text-xs font-bold text-red-700">🔴 Letztes Training vor Sperre</div>
      )}
      {hasReachedLimit(m) && (
        <div className="text-xs font-bold text-red-700">Limit erreicht</div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={`/verwaltung-neu/mitglieder/${m.id}`}>
          <button type="button" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:border-zinc-400">
            Daten ändern
          </button>
        </Link>
      </div>
    </div>
  )
}

export default function MitgliederListClient({ members }: { members: MemberRow[] }) {
  const [localMembers, setLocalMembers] = useState<MemberRow[]>(members)
  const [search, setSearch] = useState("")
  const [groupFilter, setGroupFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")

  useEffect(() => {
    setLocalMembers(members)
  }, [members])

  const filteredMembers = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim()

    return localMembers
      .filter((m) => m.member_phase === "member")
      .filter((m) => {
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

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
          <div className="text-xs font-semibold text-zinc-500">Teilnehmer heute</div>
          <div className="text-xl font-extrabold text-zinc-900">{totalTodayCount}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
          <div className="text-xs font-semibold text-zinc-500">kritisch (≥7)</div>
          <div className="text-xl font-extrabold text-red-700">{totalCriticalCount}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
          <div className="text-xs font-semibold text-zinc-500">offen</div>
          <div className="text-xl font-extrabold text-amber-700">{totalOpenCount}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          placeholder="Name oder E-Mail suchen"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[260px] rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        />
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
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
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        >
          <option value="all">Alle</option>
          <option value="approved">Freigegeben</option>
          <option value="pending">Offen</option>
        </select>
      </div>

      {criticalTodayMembers.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          🔴 Kritisch heute ({criticalTodayMembers.length})
        </div>
      )}

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
        Heute im Training ({todayMembers.length})
      </div>

      <div className="space-y-3">
        {todayMembers.map((m) => <MemberCard key={m.id} m={m} />)}
      </div>

      <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-700">
        Nicht im Training ({notTodayMembers.length})
      </div>

      <div className="space-y-3">
        {notTodayMembers.map((m) => <MemberCard key={m.id} m={m} />)}
      </div>
    </>
  )
}