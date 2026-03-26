"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronDown, ChevronUp } from "lucide-react"
import { hashSecret } from "@/lib/clientCrypto"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type MemberRecord = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  email?: string | null
  email_verified?: boolean
  email_verified_at?: string | null
  phone?: string | null
  guardian_name?: string | null
  is_competition_member?: boolean | null
  has_competition_pass?: boolean | null
  competition_license_number?: string | null
  last_medical_exam_date?: string | null
  competition_fights?: number | null
  competition_wins?: number | null
  competition_losses?: number | null
  competition_draws?: number | null
  is_trial?: boolean
  is_approved?: boolean
  base_group?: string | null
}

type CheckinSummaryRow = {
  member_id: string
  created_at: string
  date: string
}

type ParentLinkSummary = {
  parent_account_id: string
  parent_name: string
  email: string
  phone?: string | null
}

type MemberStatusFilter =
  | "alle"
  | "probemitglied"
  | "wartet_auf_email"
  | "registriert"
  | "freigegeben"

const memberGroupOptions = [
  "Boxzwerge",
  "Grundgruppe 10 bis 14 Jahre",
  "Grundgruppe ab 15 Jahren",
  "L-Gruppe",
  "Basic ab 18 Jahre",
  "Trainer",
]

function getMemberDisplayName(member?: Partial<MemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

function getMemberStatus(member: MemberRecord): Exclude<MemberStatusFilter, "alle"> {
  if (member.is_trial) return "probemitglied"
  if (member.is_approved) return "freigegeben"
  if (member.email_verified) return "registriert"
  return "wartet_auf_email"
}

function getStatusLabel(status: Exclude<MemberStatusFilter, "alle">) {
  switch (status) {
    case "probemitglied":
      return "Probemitglied"
    case "wartet_auf_email":
      return "Wartet auf E-Mail"
    case "registriert":
      return "Registriert"
    case "freigegeben":
      return "Mitglied"
  }
}

function getStatusBadgeClass(status: Exclude<MemberStatusFilter, "alle">) {
  switch (status) {
    case "probemitglied":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "wartet_auf_email":
      return "bg-zinc-100 text-zinc-700 border-zinc-200"
    case "registriert":
      return "bg-blue-100 text-blue-800 border-blue-200"
    case "freigegeben":
      return "bg-green-100 text-green-800 border-green-200"
  }
}

function getAgeInYears(birthdate?: string) {
  if (!birthdate) return null

  const today = new Date()
  const birth = new Date(`${birthdate}T12:00:00`)

  if (Number.isNaN(birth.getTime())) return null

  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }

  return age
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}

function isBoxzwergeMember(member?: Pick<MemberRecord, "base_group"> | null) {
  return member?.base_group === "Boxzwerge"
}

export default function MitgliederverwaltungPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>("alle")
  const [groupFilter, setGroupFilter] = useState("alle")
  const [sortBy, setSortBy] = useState("name")
  const [visitsByMember, setVisitsByMember] = useState<Record<string, number>>({})
  const [lastActivityByMember, setLastActivityByMember] = useState<Record<string, string>>({})
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [resendingVerificationMemberId, setResendingVerificationMemberId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editGuardianName, setEditGuardianName] = useState("")
  const [editParentName, setEditParentName] = useState("")
  const [editParentEmail, setEditParentEmail] = useState("")
  const [editParentPhone, setEditParentPhone] = useState("")
  const [editParentAccessCode, setEditParentAccessCode] = useState("")
  const [editMemberAccessCode, setEditMemberAccessCode] = useState("")
  const [parentLinksByMember, setParentLinksByMember] = useState<Record<string, ParentLinkSummary>>({})

  useEffect(() => {
    if (typeof window === "undefined") return

    const nextGroup = new URLSearchParams(window.location.search).get("gruppe")
    if (nextGroup?.trim()) {
      setGroupFilter(nextGroup)
    }
  }, [])

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        setLoadError("")
        const response = await fetch("/api/admin/members-overview", {
          cache: "no-store",
        })
        if (!response.ok) {
          if (response.status === 401) {
            clearTrainerAccess()
            throw new Error("Admin-Sitzung abgelaufen. Bitte neu anmelden.")
          }
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          members: MemberRecord[]
          checkinRows: CheckinSummaryRow[]
          parentLinks: Array<{
            member_id: string
            parent_account_id: string
            parent_accounts?: ParentLinkSummary | null
          }>
        }

        setMembers(payload.members ?? [])

        const nextLinks: Record<string, ParentLinkSummary> = {}
        for (const row of payload.parentLinks ?? []) {
          if (!row.parent_accounts) continue
          nextLinks[row.member_id] = {
            parent_account_id: row.parent_account_id,
            parent_name: row.parent_accounts.parent_name,
            email: row.parent_accounts.email,
            phone: row.parent_accounts.phone,
          }
        }
        setParentLinksByMember(nextLinks)

        const checkinRows = payload.checkinRows ?? []
        const nextVisits: Record<string, number> = {}
        const nextLastActivity: Record<string, string> = {}

        for (const row of checkinRows) {
          nextVisits[row.member_id] = (nextVisits[row.member_id] ?? 0) + 1
          if (!nextLastActivity[row.member_id]) {
            nextLastActivity[row.member_id] = row.created_at
          }
        }

        setVisitsByMember(nextVisits)
        setLastActivityByMember(nextLastActivity)
      } catch (error) {
        console.error(error)
        setLoadError(getErrorMessage(error, "Mitglieder konnten nicht geladen werden."))
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, trainerRole])

  const groupOptions = useMemo(() => {
    return Array.from(new Set(members.map((member) => member.base_group).filter(Boolean) as string[])).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [members])

  const filteredMembers = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase()

    const rows = members.filter((member) => {
      const status = getMemberStatus(member)
      const matchesSearch =
        trimmedSearch === "" ||
        getMemberDisplayName(member).toLowerCase().includes(trimmedSearch) ||
        (member.email ?? "").toLowerCase().includes(trimmedSearch) ||
        (member.guardian_name ?? "").toLowerCase().includes(trimmedSearch)

      const matchesStatus = statusFilter === "alle" || status === statusFilter
      const matchesGroup = groupFilter === "alle" || (member.base_group ?? "ohne-gruppe") === groupFilter

      return matchesSearch && matchesStatus && matchesGroup
    })

    rows.sort((a, b) => {
      if (sortBy === "gruppe") {
        return (a.base_group ?? "").localeCompare(b.base_group ?? "")
      }

      if (sortBy === "checkins") {
        return (visitsByMember[b.id] ?? 0) - (visitsByMember[a.id] ?? 0)
      }

      if (sortBy === "aktivitaet") {
        return (lastActivityByMember[b.id] ?? "").localeCompare(lastActivityByMember[a.id] ?? "")
      }

      if (sortBy === "boxzwerge_warnung") {
        const aWarning = a.base_group === "Boxzwerge" && (getAgeInYears(a.birthdate) ?? -1) >= 10
        const bWarning = b.base_group === "Boxzwerge" && (getAgeInYears(b.birthdate) ?? -1) >= 10

        if (aWarning !== bWarning) return aWarning ? -1 : 1
      }

      return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))
    })

    return rows
  }, [groupFilter, lastActivityByMember, members, search, sortBy, statusFilter, visitsByMember])

  const hasActiveFilters =
    search.trim() !== "" || statusFilter !== "alle" || groupFilter !== "alle" || sortBy !== "name"

  const summary = useMemo(() => {
    return {
      total: members.length,
      trial: members.filter((member) => getMemberStatus(member) === "probemitglied").length,
      waitingEmail: members.filter((member) => getMemberStatus(member) === "wartet_auf_email").length,
      registered: members.filter((member) => getMemberStatus(member) === "registriert").length,
      approved: members.filter((member) => getMemberStatus(member) === "freigegeben").length,
      missingPhone: members.filter((member) => !(member.phone ?? "").trim()).length,
      boxzwergeWarning: members.filter((member) => member.base_group === "Boxzwerge" && (getAgeInYears(member.birthdate) ?? -1) >= 10).length,
      parentLinked: Object.keys(parentLinksByMember).length,
    }
  }, [members, parentLinksByMember])

  const editingMember = useMemo(
    () => members.find((member) => member.id === editingMemberId) ?? null,
    [editingMemberId, members]
  )
  const editingParentLink = editingMemberId ? parentLinksByMember[editingMemberId] ?? null : null
  const editingMemberIsBoxzwerge = isBoxzwergeMember(editingMember)

  function clearEditingState() {
    setEditingMemberId(null)
    setResendingVerificationMemberId(null)
    setEditEmail("")
    setEditPhone("")
    setEditGuardianName("")
    setEditParentName("")
    setEditParentEmail("")
    setEditParentPhone("")
    setEditParentAccessCode("")
    setEditMemberAccessCode("")
  }

  async function resendVerificationEmail(member: MemberRecord) {
    if (!member.id || !member.email) {
      alert("Mitgliedsdaten unvollständig")
      return
    }

    setResendingVerificationMemberId(member.id)
    try {
      const response = await fetch("/api/admin/member-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resend_verification",
          memberId: member.id,
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      alert("Bestätigungs-Mail wurde erneut versendet.")
    } catch (error) {
      console.error(error)
      alert(getErrorMessage(error, "Bestätigungs-Mail konnte nicht versendet werden."))
    } finally {
      setResendingVerificationMemberId(null)
    }
  }

  async function resendVerificationEmailsToAll() {
    try {
      const unverifiedMembers = members.filter((member) => !member.email_verified && member.email);

      if (unverifiedMembers.length === 0) {
        alert("Es gibt keine unbestätigten Mitglieder mit E-Mail-Adressen.");
        return;
      }

      const confirmation = window.confirm(
        `Möchten Sie Bestätigungs-E-Mails an ${unverifiedMembers.length} unbestätigte Mitglieder senden?`
      );

      if (!confirmation) return;

      for (const member of unverifiedMembers) {
        await resendVerificationEmail(member);
      }

      alert("Bestätigungs-E-Mails wurden an alle unbestätigten Mitglieder gesendet.");
    } catch (error) {
      console.error(error);
      alert("Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.");
    }
  }

  function openMemberEditor(member: MemberRecord) {
    const isBoxzwerge = isBoxzwergeMember(member)
    setEditingMemberId(member.id)
    setEditEmail(member.email || "")
    setEditPhone(member.phone || "")
    setEditGuardianName(isBoxzwerge ? member.guardian_name || "" : "")
    setEditParentName(isBoxzwerge ? parentLinksByMember[member.id]?.parent_name || member.guardian_name || "" : "")
    setEditParentEmail(isBoxzwerge ? parentLinksByMember[member.id]?.email || member.email || "" : "")
    setEditParentPhone(isBoxzwerge ? parentLinksByMember[member.id]?.phone || member.phone || "" : "")
    setEditParentAccessCode("")
    setEditMemberAccessCode("")
  }

  function toggleMemberEditor(member: MemberRecord) {
    if (editingMemberId === member.id) {
      clearEditingState()
      return
    }
    openMemberEditor(member)
  }

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitgliederverwaltung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nur im Admin-Modus.</div>
          <Button asChild className="rounded-2xl">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Mitgliederverwaltung</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/">Zurück zum Dashboard</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Gesamt</div>
            <div className="mt-1 text-3xl font-bold">{summary.total}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Probemitglieder</div>
            <div className="mt-1 text-3xl font-bold text-amber-600">{summary.trial}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Warten auf E-Mail</div>
            <div className="mt-1 text-3xl font-bold text-zinc-700">{summary.waitingEmail}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Registriert</div>
            <div className="mt-1 text-3xl font-bold text-blue-600">{summary.registered}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Mitglieder</div>
            <div className="mt-1 text-3xl font-bold text-green-600">{summary.approved}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Ohne Telefon</div>
            <div className="mt-1 text-3xl font-bold text-amber-600">{summary.missingPhone}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Boxzwerge Warnung 10+</div>
            <div className="mt-1 text-3xl font-bold text-red-600">{summary.boxzwergeWarning}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Mit Elternkonto verknüpft</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{summary.parentLinked}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {loadError}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Suche</Label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name oder E-Mail"
                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as MemberStatusFilter)}>
                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Stati</SelectItem>
                  <SelectItem value="probemitglied">Probemitglied</SelectItem>
                  <SelectItem value="wartet_auf_email">Wartet auf E-Mail-Bestätigung</SelectItem>
                  <SelectItem value="registriert">Registriert</SelectItem>
                  <SelectItem value="freigegeben">Freigegeben</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Gruppe</Label>
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Gruppen</SelectItem>
                  {groupOptions.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sortierung</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="gruppe">Gruppe</SelectItem>
                  <SelectItem value="checkins">Check-ins</SelectItem>
                  <SelectItem value="aktivitaet">Letzte Aktivität</SelectItem>
                  <SelectItem value="boxzwerge_warnung">Boxzwerge 10+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-100 p-3 text-sm text-zinc-700">
            <div>
              Sichtbar: <span className="font-semibold text-zinc-900">{filteredMembers.length}</span> von{" "}
              <span className="font-semibold text-zinc-900">{members.length}</span> Mitgliedern
              {groupFilter !== "alle" ? (
                <span className="ml-2 text-zinc-500">· Gruppe: {groupFilter}</span>
              ) : null}
              {statusFilter !== "alle" ? (
                <span className="ml-2 text-zinc-500">· Status: {getStatusLabel(statusFilter)}</span>
              ) : null}
            </div>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                onClick={() => {
                  setSearch("")
                  setStatusFilter("alle")
                  setGroupFilter("alle")
                  setSortBy("name")
                }}
              >
                Filter zurücksetzen
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitgliederliste</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Mitglieder werden geladen...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
              Keine Mitglieder fuer die aktuelle Filterung gefunden.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gruppe</TableHead>
                  <TableHead>Rollen</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Check-ins</TableHead>
                  <TableHead>Letzte Aktivität</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => {
                  const status = getMemberStatus(member)
                  const lastActivity = lastActivityByMember[member.id]
                  const age = getAgeInYears(member.birthdate)
                  const isBoxzwergeWarning = member.base_group === "Boxzwerge" && (age ?? -1) >= 10
                  const isBoxzwerge = isBoxzwergeMember(member)
                  const parentLink = parentLinksByMember[member.id] ?? null
                  const isExpanded = editingMemberId === member.id

                  return (
                    <Fragment key={member.id}>
                      <TableRow
                        className={`cursor-pointer ${isBoxzwergeWarning ? "bg-red-50/80" : ""}`}
                        onClick={() => toggleMemberEditor(member)}
                      >
                        <TableCell>
                          <div className="font-medium text-zinc-900">{getMemberDisplayName(member)}</div>
                          <div className={`text-xs ${isBoxzwergeWarning ? "text-red-700" : "text-zinc-500"}`}>
                            {isBoxzwerge ? "Kind · " : ""}
                            {member.birthdate || "Geburtsdatum offen"}
                            {age !== null ? ` · ${age} Jahre` : ""}
                          </div>
                          {isBoxzwergeWarning ? (
                            <div className="mt-1 text-xs font-semibold text-red-700">Boxzwerge-Warnung ab 10 Jahren</div>
                          ) : null}
                          {isBoxzwerge ? (
                            <div className="mt-2 space-y-1 text-xs text-zinc-600">
                              <div>Kind / Boxzwerg: {getMemberDisplayName(member)}</div>
                              <div>Eltern / Notfallkontakt: {member.guardian_name || "—"}</div>
                              <div>Elternkonto: {parentLink ? `${parentLink.parent_name} · ${parentLink.email}` : "—"}</div>
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {status === "freigegeben" ? "—" : (
                            <Badge variant="outline" className={getStatusBadgeClass(status)}>
                              {getStatusLabel(status)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{member.base_group || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {member.base_group === "Trainer" ? <Badge variant="outline">Trainer</Badge> : null}
                            {member.is_competition_member ? <Badge variant="outline">Wettkämpfer</Badge> : null}
                            {member.base_group !== "Trainer" && !member.is_competition_member ? "—" : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isBoxzwerge ? (
                            <div className="space-y-1">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Eltern</div>
                              <div>{member.phone || "—"}</div>
                            </div>
                          ) : (
                            member.phone || "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {isBoxzwerge ? (
                            <div className="space-y-1">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Eltern</div>
                              <div>{member.email || "—"}</div>
                            </div>
                          ) : (
                            member.email || "—"
                          )}
                        </TableCell>
                        <TableCell>{visitsByMember[member.id] ?? 0}</TableCell>
                        <TableCell>{lastActivity ? new Date(lastActivity).toLocaleString("de-DE") : "Noch kein Check-in"}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-xl"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleMemberEditor(member)
                            }}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && editingMember ? (
                        <TableRow className="bg-zinc-50/80 hover:bg-zinc-50/80">
                          <TableCell colSpan={9} className="p-4">
                            <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
                                <div className="font-semibold text-zinc-900">{getMemberDisplayName(editingMember)}</div>
                                <div className="mt-1">
                                  {editingMemberIsBoxzwerge ? "Kind" : "Geburtsdatum"}: {editingMember.birthdate || "—"} · Stammgruppe: {editingMember.base_group || "—"}
                                </div>
                                {editingMemberIsBoxzwerge ? <div className="mt-1 text-xs text-zinc-500">Name und Geburtsdatum gehören zum Kind. E-Mail und Telefon unten gehören zu den Eltern.</div> : null}
                              </div>

                              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div className="space-y-2">
                                  <Label>Stammgruppe</Label>
                                  <Select
                                    value={editingMember.base_group || "Basic ab 18 Jahre"}
                                    onValueChange={async (nextGroup) => {
                                      try {
                                        setSavingMemberId(editingMember.id)
                                        const response = await fetch("/api/admin/member-action", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            action: "change_group",
                                            memberId: editingMember.id,
                                            baseGroup: nextGroup,
                                          }),
                                        })
                                        if (!response.ok) throw new Error(await response.text())
                                        const payload = (await response.json()) as { member: MemberRecord }
                                        const updated = payload.member
                                        setMembers((current) =>
                                          current.map((row) => (row.id === editingMember.id ? { ...row, base_group: updated.base_group } : row))
                                        )
                                      } catch (error) {
                                        alert(getErrorMessage(error, "Die Gruppe konnte nicht gespeichert werden."))
                                      } finally {
                                        setSavingMemberId(null)
                                      }
                                    }}
                                    disabled={savingMemberId === editingMember.id}
                                  >
                                    <SelectTrigger className="h-10 rounded-2xl bg-white">
                                      <SelectValue placeholder="Gruppe wählen" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {memberGroupOptions.map((group) => (
                                        <SelectItem key={group} value={group}>
                                          {group}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2 md:col-span-1 xl:col-span-3">
                                  <Label>Rollen</Label>
                                  <div className="flex flex-wrap gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                    <label className="flex items-center gap-2 text-sm text-zinc-700">
                                      <input
                                        type="checkbox"
                                        checked={editingMember.base_group === "Trainer"}
                                        disabled={savingMemberId === editingMember.id}
                                        onChange={async (event) => {
                                          try {
                                            setSavingMemberId(editingMember.id)
                                            const shouldBecomeTrainer = event.target.checked
                                            const nextGroup =
                                              shouldBecomeTrainer
                                                ? "Trainer"
                                                : editingMember.base_group === "Trainer"
                                                  ? "Basic ab 18 Jahre"
                                                  : (editingMember.base_group ?? "Basic ab 18 Jahre")

                                            if (!shouldBecomeTrainer && editingMember.base_group === "Trainer") {
                                              const confirmed = window.confirm(
                                                `${getMemberDisplayName(editingMember)} aus der Trainerrolle nehmen? Die Stammgruppe wird dabei auf "Basic ab 18 Jahre" gesetzt und kann danach angepasst werden.`
                                              )
                                              if (!confirmed) return
                                            }

                                            const response = await fetch("/api/admin/member-action", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({
                                                action: "change_group",
                                                memberId: editingMember.id,
                                                baseGroup: nextGroup,
                                              }),
                                            })
                                            if (!response.ok) throw new Error(await response.text())
                                            const payload = (await response.json()) as { member: MemberRecord }
                                            const updated = payload.member
                                            setMembers((current) =>
                                              current.map((row) => (row.id === editingMember.id ? { ...row, base_group: updated.base_group } : row))
                                            )
                                          } catch (error) {
                                            alert(getErrorMessage(error, "Die Trainerrolle konnte nicht gespeichert werden."))
                                          } finally {
                                            setSavingMemberId(null)
                                          }
                                        }}
                                      />
                                      <span>Trainer</span>
                                    </label>

                                    <label className="flex items-center gap-2 text-sm text-zinc-700">
                                      <input
                                        type="checkbox"
                                        checked={!!editingMember.is_competition_member}
                                        disabled={savingMemberId === editingMember.id}
                                        onChange={async (event) => {
                                          try {
                                            setSavingMemberId(editingMember.id)
                                            const response = await fetch("/api/admin/member-action", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({
                                                action: "set_competition",
                                                memberId: editingMember.id,
                                                isCompetitionMember: event.target.checked,
                                                competitionLicenseNumber: editingMember.competition_license_number ?? undefined,
                                                lastMedicalExamDate: editingMember.last_medical_exam_date ?? undefined,
                                                competitionFights: editingMember.competition_fights ?? 0,
                                                competitionWins: editingMember.competition_wins ?? 0,
                                                competitionLosses: editingMember.competition_losses ?? 0,
                                                competitionDraws: editingMember.competition_draws ?? 0,
                                              }),
                                            })
                                            if (!response.ok) throw new Error(await response.text())
                                            const payload = (await response.json()) as { member: MemberRecord }
                                            const updated = payload.member

                                            if (!editingMember.is_competition_member && updated.is_competition_member && editingMember.email) {
                                              await fetch("/api/send-verification", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                  purpose: "competition_assigned",
                                                  email: editingMember.email,
                                                  name: `${editingMember.first_name ?? ""} ${editingMember.last_name ?? ""}`.trim() || editingMember.name,
                                                }),
                                              })
                                            }

                                            if (editingMember.is_competition_member && !updated.is_competition_member && editingMember.email) {
                                              await fetch("/api/send-verification", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                  purpose: "competition_removed",
                                                  email: editingMember.email,
                                                  name: `${editingMember.first_name ?? ""} ${editingMember.last_name ?? ""}`.trim() || editingMember.name,
                                                }),
                                              })
                                            }

                                            setMembers((current) =>
                                              current.map((row) =>
                                                row.id === editingMember.id
                                                  ? {
                                                      ...row,
                                                      is_competition_member: updated.is_competition_member,
                                                      has_competition_pass: updated.has_competition_pass,
                                                      competition_license_number: updated.competition_license_number,
                                                      last_medical_exam_date: updated.last_medical_exam_date,
                                                      competition_fights: updated.competition_fights,
                                                      competition_wins: updated.competition_wins,
                                                      competition_losses: updated.competition_losses,
                                                      competition_draws: updated.competition_draws,
                                                    }
                                                  : row
                                              )
                                            )
                                          } catch (error) {
                                            alert(getErrorMessage(error, "Die Wettkämpferrolle konnte nicht gespeichert werden."))
                                          } finally {
                                            setSavingMemberId(null)
                                          }
                                        }}
                                      />
                                      <span>Wettkämpfer</span>
                                    </label>
                                  </div>
                                </div>
                              </div>

                              <form
                                className="grid gap-4 md:grid-cols-2"
                                onSubmit={async (event) => {
                                  event.preventDefault()

                                  try {
                                    setSavingMemberId(editingMember.id)
                                    const response = await fetch("/api/admin/member-profile", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        action: "save_profile",
                                        memberId: editingMember.id,
                                        email: editEmail.trim(),
                                        phone: editPhone.trim(),
                                        guardianName: editingMemberIsBoxzwerge ? editGuardianName.trim() : undefined,
                                        memberPin: editMemberAccessCode.trim() || undefined,
                                        parent:
                                          editingMemberIsBoxzwerge && editParentEmail.trim() && editParentName.trim()
                                            ? {
                                                name: editParentName.trim(),
                                                email: editParentEmail.trim(),
                                                phone: editParentPhone.trim(),
                                                accessCodeHash: editParentAccessCode.trim()
                                                  ? await hashSecret(editParentAccessCode.trim())
                                                  : undefined,
                                              }
                                            : null,
                                      }),
                                    })

                                    if (!response.ok) throw new Error(await response.text())

                                    const payload = (await response.json()) as { member: MemberRecord; parentLink?: ParentLinkSummary | null }
                                    const updated = payload.member

                                    setMembers((current) =>
                                      current.map((row) =>
                                        row.id === editingMember.id
                                          ? {
                                              ...row,
                                              email: updated.email,
                                              phone: updated.phone,
                                              guardian_name: updated.guardian_name,
                                            }
                                          : row
                                      )
                                    )

                                    if (payload.parentLink) {
                                      setParentLinksByMember((current) => ({
                                        ...current,
                                        [editingMember.id]: payload.parentLink as ParentLinkSummary,
                                      }))
                                    }
                                  } catch (error) {
                                    console.error(error)
                                    alert(getErrorMessage(error, "Die Kontaktdaten konnten nicht gespeichert werden."))
                                  } finally {
                                    setSavingMemberId(null)
                                  }
                                }}
                              >
                                <div className="space-y-2">
                                  <Label>{editingMemberIsBoxzwerge ? "Eltern-E-Mail" : "E-Mail"}</Label>
                                  <Input
                                    value={editEmail}
                                    onChange={(event) => setEditEmail(event.target.value)}
                                    placeholder={editingMemberIsBoxzwerge ? "E-Mail der Eltern" : "E-Mail-Adresse"}
                                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>{editingMemberIsBoxzwerge ? "Eltern-Telefon" : "Telefon"}</Label>
                                  <Input
                                    value={editPhone}
                                    onChange={(event) => setEditPhone(event.target.value)}
                                    placeholder={editingMemberIsBoxzwerge ? "Telefon der Eltern" : "Telefonnummer"}
                                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                  />
                                </div>

                                {editingMemberIsBoxzwerge ? (
                                  <>
                                    <div className="space-y-2 md:col-span-2">
                                      <Label>Eltern / Notfallkontakt</Label>
                                      <Input
                                        value={editGuardianName}
                                        onChange={(event) => setEditGuardianName(event.target.value)}
                                        placeholder="Name des Elternteils oder Notfallkontakts"
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                    </div>

                                    <div className="space-y-2 md:col-span-2">
                                      <Label>Zusätzliches Elternkonto / Familienkonto</Label>
                                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                                        <div className="flex items-center gap-2">
                                          <span>Elternkonto hier verknüpfen.</span>
                                          <InfoHint text="Hier kannst du ein bestehendes oder neues Elternkonto mit dem Kind verknüpfen. Dieselbe Eltern-E-Mail kann parallel auch zu einem eigenen Sportlerkonto in der Ü18-Gruppe gehören." />
                                        </div>
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Elternkonto-Name</Label>
                                      <Input
                                        value={editParentName}
                                        onChange={(event) => setEditParentName(event.target.value)}
                                        placeholder="Name des Elternkontos"
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Elternkonto-E-Mail</Label>
                                      <Input
                                        type="email"
                                        value={editParentEmail}
                                        onChange={(event) => setEditParentEmail(event.target.value)}
                                        placeholder="E-Mail des Elternkontos"
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Elternkonto-Telefon</Label>
                                      <Input
                                        value={editParentPhone}
                                        onChange={(event) => setEditParentPhone(event.target.value)}
                                        placeholder="Telefon des Elternkontos"
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label>Neuer Eltern-Zugangscode</Label>
                                      <PasswordInput
                                        value={editParentAccessCode}
                                        onChange={(event) => setEditParentAccessCode(event.target.value)}
                                        placeholder={editingParentLink ? "Nur ausfüllen, wenn der Elterncode geändert werden soll" : "6 bis 16 Zeichen für neues Elternkonto"}
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                    </div>

                                    <div className="space-y-2 md:col-span-2">
                                      <Label>Eigener Zugangscode für das Kind</Label>
                                      <PasswordInput
                                        value={editMemberAccessCode}
                                        onChange={(event) => setEditMemberAccessCode(event.target.value)}
                                        placeholder="Optional, z. B. wenn das Kind aus dem Elternkonto gelöst wird"
                                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                                      />
                                    </div>
                                  </>
                                ) : null}

                                <div className="flex flex-wrap gap-3 md:col-span-2">
                                  <Button
                                    type="submit"
                                    className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                                    disabled={savingMemberId === editingMember.id}
                                  >
                                    {savingMemberId === editingMember.id ? "Speichert..." : "Änderungen speichern"}
                                  </Button>
                                  <Button type="button" variant="outline" className="rounded-2xl" onClick={clearEditingState}>
                                    Schließen
                                  </Button>
                                  {editingMemberIsBoxzwerge && editingParentLink ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-2xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                                      disabled={savingMemberId === editingMember.id}
                                      onClick={async () => {
                                        try {
                                          setSavingMemberId(editingMember.id)
                                          const response = await fetch("/api/admin/member-profile", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                              action: "unlink_parent",
                                              memberId: editingMember.id,
                                            }),
                                          })
                                          if (!response.ok) throw new Error(await response.text())
                                          setParentLinksByMember((current) => {
                                            const next = { ...current }
                                            delete next[editingMember.id]
                                            return next
                                          })
                                          setEditParentName("")
                                          setEditParentEmail("")
                                          setEditParentPhone("")
                                          alert("Kind wurde vom Elternkonto getrennt.")
                                        } catch (error) {
                                          console.error(error)
                                          alert(getErrorMessage(error, "Die Verknüpfung konnte nicht gelöst werden."))
                                        } finally {
                                          setSavingMemberId(null)
                                        }
                                      }}
                                    >
                                      Vom Elternkonto trennen
                                    </Button>
                                  ) : null}
                                  {!editingMember.email_verified && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-2xl border-[#c8d8ea] text-[#154c83]"
                                      disabled={resendingVerificationMemberId === editingMember.id}
                                      onClick={async () => {
                                        await resendVerificationEmail(editingMember)
                                      }}
                                    >
                                      {resendingVerificationMemberId === editingMember.id ? "Sendet..." : "Bestätigungs-Mail erneut senden"}
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-2xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                                    disabled={savingMemberId === editingMember.id}
                                    onClick={async () => {
                                      const confirmed = window.confirm(
                                        `${getMemberDisplayName(editingMember)} wirklich löschen? Alle Check-ins dieser Person werden ebenfalls entfernt.`
                                      )
                                      if (!confirmed) return
                                      try {
                                        setSavingMemberId(editingMember.id)
                                        const response = await fetch("/api/admin/member-profile", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            action: "delete_member",
                                            memberId: editingMember.id,
                                          }),
                                        })
                                        if (!response.ok) throw new Error(await response.text())
                                        setMembers((current) => current.filter((row) => row.id !== editingMember.id))
                                        setVisitsByMember((current) => {
                                          const next = { ...current }
                                          delete next[editingMember.id]
                                          return next
                                        })
                                        setLastActivityByMember((current) => {
                                          const next = { ...current }
                                          delete next[editingMember.id]
                                          return next
                                        })
                                        clearEditingState()
                                      } catch (error) {
                                        console.error(error)
                                        alert("Das Mitglied konnte nicht gelöscht werden.")
                                      } finally {
                                        setSavingMemberId(null)
                                      }
                                    }}
                                  >
                                    {savingMemberId === editingMember.id ? "Löscht..." : "Mitglied löschen"}
                                  </Button>
                                </div>
                              </form>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
