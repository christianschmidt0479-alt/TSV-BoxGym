"use client"
import { type FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { OfficeMatchBadge } from "@/components/verwaltung-neu/OfficeMatchBadge"

type MemberRow = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  birthdate?: string | null
  base_group?: string | null
  office_list_status?: string | null
  office_list_group?: string | null
  office_list_checked_at?: string | null
  is_trial?: boolean | null
  is_approved?: boolean | null
  email_verified?: boolean | null
  member_phase?: "trial" | "extended" | "member"
  created_at?: string | null
  checkinCount?: number
  checkedInToday?: boolean
}

type MemberListFilters = {
  search: string
  groupFilter: string
  statusFilter: string
  gsFilter: string
}

function memberName(member: MemberRow) {
  return (member.name || `${member.first_name || ""} ${member.last_name || ""}`).trim() || "Unbekannt"
}

function memberStatus(member: MemberRow) {
  if (member.is_trial) return "Probemitglied"
  if (!member.is_approved) return "Mitglied - Prüfung offen"
  return "Freigegeben"
}

function formatShortDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(date)
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

function MemberCard({ m, hasCheckinData, currentListUrl }: { m: MemberRow; hasCheckinData: boolean; currentListUrl: string }) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">{memberName(m)}</div>
          <div className="truncate text-xs text-zinc-500">{m.email || "-"}</div>
          <div className="text-xs text-zinc-600">Gruppe: {m.base_group || "-"}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {!m.is_approved ? (
            <span className={priorityBadge(m)}>{priorityLabel(m)}</span>
          ) : null}
          <OfficeMatchBadge
            status={m.office_list_status}
            baseGroup={m.base_group}
            officeGroup={m.office_list_group}
            checkedAt={m.office_list_checked_at}
            compact
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-700">
        <span><strong>Status:</strong> {memberStatus(m)}</span>
        <span className={m.email_verified ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
          {m.email_verified ? "E-Mail ok" : "E-Mail offen"}
        </span>
      </div>
      {m.base_group === "L-Gruppe" ? <div className="text-xs text-zinc-600">L-Gruppe: Abgleich über Stamm-/Office-Gruppe prüfen.</div> : null}

      {showDetails ? (
        <div className="grid gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-700 sm:grid-cols-2">
          <div><strong>Telefon:</strong> {m.phone || "-"}</div>
          <div><strong>Geburtsdatum:</strong> {formatShortDate(m.birthdate)}</div>
          <div><strong>E-Mail-Status:</strong> {m.email_verified ? "bestätigt" : "offen"}</div>
          <div><strong>Office-Gruppe:</strong> {m.office_list_group || "-"}</div>
          <div><strong>GS geprüft:</strong> {formatShortDate(m.office_list_checked_at)}</div>
          <div><strong>Angelegt:</strong> {formatShortDate(m.created_at)}</div>
          {!m.email_verified ? <div className="font-bold text-orange-800">Neu / Registrierung unvollständig</div> : null}
          {!m.is_approved ? <div className="font-semibold text-amber-700">Mitgliederprüfung offen</div> : null}
          {m.base_group && m.office_list_group && m.base_group !== m.office_list_group ? <div className="font-bold text-red-700">Gruppenabweichung</div> : null}
          {hasCheckinData ? (
            <>
              <div className={isLastTrainingBeforeBlock(m) ? "font-bold text-red-700" : undefined}>
                <strong>Check-ins:</strong> {m.checkinCount ?? 0} / {limitFor(m)}
              </div>
              <div>
                {m.checkedInToday ? "Heute im Training" : "Heute nicht im Training"}
              </div>
              {hasReachedLimit(m) ? <div className="font-bold text-red-700">Limit erreicht</div> : null}
              {hasCheckinData && m.email_verified && !m.is_approved && (m.checkinCount ?? 0) >= 5 ? <div className="font-bold text-blue-700">Empfehlung: Freigabe prüfen</div> : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <Link href={`/verwaltung-neu/mitglieder/${m.id}?returnTo=${encodeURIComponent(currentListUrl)}`}>
          <button type="button" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:border-zinc-400">
            Daten ändern
          </button>
        </Link>
        <button
          type="button"
          onClick={() => setShowDetails((value) => !value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:border-zinc-400"
        >
          {showDetails ? "Details verbergen" : "Details anzeigen"}
        </button>
      </div>
    </div>
  )
}

export default function MitgliederListClient({
  members,
  totalTodayCount,
  hasCheckinData = true,
  initialSearch,
  initialGroupFilter,
  initialStatusFilter,
  initialGsFilter,
  currentListUrl,
  onFiltersChanged,
}: {
  members: MemberRow[]
  totalTodayCount: number
  hasCheckinData?: boolean
  initialSearch: string
  initialGroupFilter: string
  initialStatusFilter: string
  initialGsFilter: string
  currentListUrl: string
  onFiltersChanged?: (filters: MemberListFilters) => void
}) {
  const [localMembers, setLocalMembers] = useState<MemberRow[]>(members)
  const [searchInput, setSearchInput] = useState(initialSearch)
  const [search, setSearch] = useState(initialSearch)
  const [groupFilter, setGroupFilter] = useState(initialGroupFilter)
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter)
  const [gsFilter, setGsFilter] = useState(initialGsFilter)

  useEffect(() => {
    setLocalMembers(members)
  }, [members])

  useEffect(() => {
    setSearchInput(initialSearch)
    setSearch(initialSearch)
    setGroupFilter(initialGroupFilter)
    setStatusFilter(initialStatusFilter)
    setGsFilter(initialGsFilter)
  }, [initialGsFilter, initialGroupFilter, initialSearch, initialStatusFilter])

  const sortedMembers = useMemo(() => {
    return [...localMembers].sort((a, b) => {
      const bucketDiff = sortBucket(a) - sortBucket(b)
      if (bucketDiff !== 0) return bucketDiff

      const countDiff = (b.checkinCount ?? 0) - (a.checkinCount ?? 0)
      if (countDiff !== 0) return countDiff

      return memberName(a).localeCompare(memberName(b), "de")
    })
  }, [localMembers])

  const todayMembers = useMemo(
    () => (hasCheckinData ? sortedMembers.filter((member) => Boolean(member.checkedInToday)) : []),
    [hasCheckinData, sortedMembers]
  )
  const criticalTodayMembers = useMemo(
    () => todayMembers.filter((member) => (member.checkinCount ?? 0) >= 7),
    [todayMembers]
  )
  const totalCriticalCount = useMemo(
    () => (hasCheckinData ? localMembers.filter((member) => (member.checkinCount ?? 0) >= 7).length : 0),
    [hasCheckinData, localMembers]
  )
  const totalOpenCount = useMemo(() => localMembers.filter((member) => !member.is_approved).length, [localMembers])

  const hasActiveFilters =
    searchInput.trim().length > 0 || search.trim().length > 0 || groupFilter !== "all" || statusFilter !== "all" || gsFilter !== "all"

  function handleSubmitSearch(event: FormEvent) {
    event.preventDefault()
    setSearch(searchInput)
    onFiltersChanged?.({ search: searchInput, groupFilter, statusFilter, gsFilter })
  }

  function resetFilters() {
    setSearchInput("")
    setSearch("")
    setGroupFilter("all")
    setStatusFilter("all")
    setGsFilter("all")
    onFiltersChanged?.({ search: "", groupFilter: "all", statusFilter: "all", gsFilter: "all" })
  }

  function handleGroupChange(value: string) {
    setGroupFilter(value)
    onFiltersChanged?.({ search, groupFilter: value, statusFilter, gsFilter })
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value)
    onFiltersChanged?.({ search, groupFilter, statusFilter: value, gsFilter })
  }

  function handleGsChange(value: string) {
    setGsFilter(value)
    onFiltersChanged?.({ search, groupFilter, statusFilter, gsFilter: value })
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
          <div className="text-xs font-semibold text-zinc-500">Teilnehmer heute</div>
          <div className="text-xl font-extrabold text-zinc-900">{hasCheckinData ? totalTodayCount : "-"}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
          <div className="text-xs font-semibold text-zinc-500">kritisch (≥7)</div>
          <div className="text-xl font-extrabold text-red-700">{hasCheckinData ? totalCriticalCount : "-"}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm">
          <div className="text-xs font-semibold text-zinc-500">offen</div>
          <div className="text-xl font-extrabold text-amber-700">{totalOpenCount}</div>
        </div>
      </div>

      <form className="flex flex-wrap gap-2" onSubmit={handleSubmitSearch}>
        <input
          placeholder="Name oder E-Mail suchen"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="min-w-[260px] rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400"
        >
          Suchen
        </button>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400"
          >
            Filter löschen
          </button>
        ) : null}
        <select
          value={groupFilter}
          onChange={(e) => handleGroupChange(e.target.value)}
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
          onChange={(e) => handleStatusChange(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        >
          <option value="all">Alle</option>
          <option value="approved">Freigegeben</option>
          <option value="pending">Offen</option>
        </select>
        <select
          value={gsFilter}
          onChange={(e) => handleGsChange(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        >
          <option value="all">GS: alle</option>
          <option value="red">GS: rot / prüfen</option>
          <option value="yellow">GS: gelb</option>
          <option value="green">GS: grün</option>
          <option value="gray">GS: grau</option>
        </select>
      </form>

      {hasCheckinData && criticalTodayMembers.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          🔴 Kritisch heute ({criticalTodayMembers.length})
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {sortedMembers.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 lg:col-span-2">
            {hasActiveFilters
              ? "Keine Treffer für die aktuelle Suche/Filterkombination."
              : "Auf dieser Seite sind aktuell keine Mitglieder."}
          </div>
        ) : (
          sortedMembers.map((m) => <MemberCard key={m.id} m={m} hasCheckinData={hasCheckinData} currentListUrl={currentListUrl} />)
        )}
      </div>
    </>
  )
}