"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type MemberRecord = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  phone?: string | null
  email?: string | null
  is_trial?: boolean
  is_approved?: boolean
  base_group?: string | null
  has_competition_pass?: boolean | null
  is_competition_member?: boolean | null
  competition_license_number?: string | null
  competition_target_weight?: number | null
  last_medical_exam_date?: string | null
  competition_fights?: number | null
  competition_wins?: number | null
  competition_losses?: number | null
  competition_draws?: number | null
}

type CheckinWeightRow = {
  member_id: string
  weight: number | null
  created_at: string
  group_name: string
}

type CompetitionDraft = {
  hasPass: boolean
  selected: boolean
  license: string
  targetWeight: string
  medical: string
  fights: string
  wins: string
  losses: string
  draws: string
}

function getMemberDisplayName(member?: Partial<MemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

async function readResponseError(response: Response, fallback: string) {
  const text = await response.text()
  if (!text.trim()) return fallback

  try {
    const parsed = JSON.parse(text) as { error?: string; details?: string }
    return parsed.details || parsed.error || text
  } catch {
    return text
  }
}

function isBoxzwergeMember(member?: Pick<MemberRecord, "base_group"> | null) {
  return normalizeTrainingGroup(member?.base_group) === "Boxzwerge"
}

function formatGermanDate(date: Date) {
  return date.toLocaleDateString("de-DE")
}

function getMedicalExamStatus(dateString: string | null | undefined) {
  if (!dateString) {
    return {
      toneClass: "text-zinc-500",
      boxClass: "rounded-2xl border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600",
      message: "Noch kein Datum hinterlegt.",
    }
  }

  const examDate = new Date(`${dateString}T12:00:00`)
  const expiryDate = new Date(examDate)
  expiryDate.setFullYear(expiryDate.getFullYear() + 1)
  expiryDate.setDate(expiryDate.getDate() - 1)

  const today = new Date()
  const todayAtNoon = new Date(`${today.toISOString().slice(0, 10)}T12:00:00`)
  const daysUntilExpiry = Math.floor((expiryDate.getTime() - todayAtNoon.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    return {
      toneClass: "text-red-800",
      boxClass: "rounded-2xl border border-red-200 bg-red-50 p-2 text-xs text-red-800",
      message: `Abgelaufen seit ${Math.abs(daysUntilExpiry)} Tagen. Gültig war bis einschließlich ${formatGermanDate(expiryDate)}.`,
    }
  }

  if (daysUntilExpiry <= 30) {
    return {
      toneClass: "text-amber-800",
      boxClass: "rounded-2xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800",
      message: `Läuft in ${daysUntilExpiry} Tagen ab. Gültig bis einschließlich ${formatGermanDate(expiryDate)}.`,
    }
  }

  return {
    toneClass: "text-zinc-500",
    boxClass: "rounded-2xl border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600",
    message: `Gültig bis einschließlich ${formatGermanDate(expiryDate)}.`,
  }
}

function getAgeInYears(birthdate?: string) {
  if (!birthdate) return null
  const today = new Date()
  const birth = new Date(`${birthdate}T12:00:00`)
  let age = today.getFullYear() - birth.getFullYear()
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())

  if (!hasHadBirthdayThisYear) {
    age -= 1
  }

  return age
}

function getCompetitionAgeClass(birthdate?: string) {
  const age = getAgeInYears(birthdate)
  if (age == null) return "—"
  if (age <= 12) return "Schüler U13"
  if (age <= 14) return "Kadett U15"
  if (age <= 16) return "Junior U17"
  if (age <= 18) return "Jugend U19"
  return "Erwachsene"
}

function getCompetitionAgeClassBadgeClass(birthdate?: string) {
  const age = getAgeInYears(birthdate)
  if (age == null) return "border-zinc-200 bg-zinc-100 text-zinc-700"
  if (age <= 12) return "border-emerald-200 bg-emerald-100 text-emerald-800"
  if (age <= 14) return "border-sky-200 bg-sky-100 text-sky-800"
  if (age <= 16) return "border-violet-200 bg-violet-100 text-violet-800"
  if (age <= 18) return "border-amber-200 bg-amber-100 text-amber-800"
  return "border-zinc-300 bg-zinc-200 text-zinc-800"
}

export default function WettkampfPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [savingId, setSavingId] = useState("")
  const [openStatsMemberId, setOpenStatsMemberId] = useState("")
  const [search, setSearch] = useState("")
  const [groupFilter, setGroupFilter] = useState("alle")
  const [statusFilter, setStatusFilter] = useState("alle")
  const [members, setMembers] = useState<MemberRecord[]>([])
  const [latestWeightByMember, setLatestWeightByMember] = useState<Record<string, CheckinWeightRow>>({})
  const [drafts, setDrafts] = useState<Record<string, CompetitionDraft>>({})

  async function saveCompetitionDraft(memberId: string, draft: CompetitionDraft) {
    const response = await fetch("/api/admin/member-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_competition",
        memberId,
        hasCompetitionPass: draft.hasPass,
        isCompetitionMember: draft.selected,
        competitionLicenseNumber: draft.license,
        competitionTargetWeight: draft.targetWeight.trim() ? Number(draft.targetWeight.replace(",", ".")) : undefined,
        lastMedicalExamDate: draft.medical,
        competitionFights: Math.max(0, Number(draft.fights || 0)),
        competitionWins: Math.max(0, Number(draft.wins || 0)),
        competitionLosses: Math.max(0, Number(draft.losses || 0)),
        competitionDraws: Math.max(0, Number(draft.draws || 0)),
      }),
    })

    if (!response.ok) {
      if (response.status === 401) {
        clearTrainerAccess()
      }
      throw new Error(await readResponseError(response, "Wettkampfdaten konnten nicht gespeichert werden."))
    }

    return (await response.json()) as { ok: true; member: MemberRecord }
  }

  async function loadData() {
    setLoading(true)
    try {
      setLoadError("")
      const response = await fetch("/api/admin/competition-overview", {
        cache: "no-store",
      })
      if (!response.ok) {
        if (response.status === 401) {
          clearTrainerAccess()
          throw new Error("Admin-Sitzung abgelaufen. Bitte neu anmelden.")
        }
        throw new Error(await readResponseError(response, "Wettkampfdaten konnten nicht geladen werden."))
      }

      const payload = (await response.json()) as {
        members: MemberRecord[]
        weightRows: CheckinWeightRow[]
      }

      const nextMembers = Array.isArray(payload.members) ? payload.members : []
      setMembers(nextMembers)

      const nextWeights: Record<string, CheckinWeightRow> = {}
      for (const row of (Array.isArray(payload.weightRows) ? payload.weightRows : [])) {
        if (!row?.member_id) continue
        if (!nextWeights[row.member_id]) {
          nextWeights[row.member_id] = row
        }
      }
      setLatestWeightByMember(nextWeights)

      const nextDrafts: Record<string, CompetitionDraft> = {}
      for (const member of nextMembers) {
        nextDrafts[member.id] = {
          hasPass: !!member.has_competition_pass,
          selected: !!member.is_competition_member,
          license: member.competition_license_number ?? "",
          targetWeight: member.competition_target_weight != null ? String(member.competition_target_weight).replace(".", ",") : "",
          medical: member.last_medical_exam_date ?? "",
          fights: String(member.competition_fights ?? 0),
          wins: String(member.competition_wins ?? 0),
          losses: String(member.competition_losses ?? 0),
          draws: String(member.competition_draws ?? 0),
        }
      }
      setDrafts(nextDrafts)
    } catch (error) {
      console.error(error)
      setLoadError(error instanceof Error ? error.message : "Wettkampfdaten konnten nicht geladen werden.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    void loadData()
  }, [authResolved, trainerRole])

  const eligibleMembers = useMemo(
    () => members.filter((member) => !member.is_trial).filter((member) => !isBoxzwergeMember(member)),
    [members]
  )

  const groupOptions = useMemo(() => {
    return Array.from(new Set(eligibleMembers.map((member) => member.base_group).filter(Boolean) as string[])).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [eligibleMembers])

  const filteredMembers = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase()

    return eligibleMembers
      .filter((member) => {
        const draft = drafts[member.id]
        const matchesSearch =
          trimmedSearch === "" ||
          getMemberDisplayName(member).toLowerCase().includes(trimmedSearch) ||
          (member.email ?? "").toLowerCase().includes(trimmedSearch)
        const matchesGroup = groupFilter === "alle" || (member.base_group ?? "ohne-gruppe") === groupFilter
        const matchesStatus =
          statusFilter === "alle" ||
          (statusFilter === "wettkampf" && !!draft?.selected) ||
          (statusFilter === "kader" && member.base_group === "L-Gruppe") ||
          (statusFilter === "offen" && !draft?.selected)

        return matchesSearch && matchesGroup && matchesStatus
      })
      .sort((a, b) => getMemberDisplayName(a).localeCompare(getMemberDisplayName(b)))
  }, [drafts, eligibleMembers, groupFilter, search, statusFilter])

  const competitionMembers = useMemo(
    () => filteredMembers.filter((member) => drafts[member.id]?.selected),
    [drafts, filteredMembers]
  )

  const candidateMembers = useMemo(
    () =>
      eligibleMembers
        .filter((member) => !!member.is_approved)
        .filter((member) => !drafts[member.id]?.selected)
        .filter((member) => {
          const trimmedSearch = search.trim().toLowerCase()
          const matchesSearch =
            trimmedSearch === "" ||
            getMemberDisplayName(member).toLowerCase().includes(trimmedSearch) ||
            (member.email ?? "").toLowerCase().includes(trimmedSearch)
          const matchesGroup = groupFilter === "alle" || (member.base_group ?? "ohne-gruppe") === groupFilter
          const matchesStatus = statusFilter === "alle" || statusFilter === "offen" || (statusFilter === "kader" && member.base_group === "L-Gruppe")
          return matchesSearch && matchesGroup && matchesStatus
        })
        .sort((a, b) => getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))),
    [drafts, eligibleMembers, groupFilter, search, statusFilter]
  )

  const summary = useMemo(() => {
    const selectedCount = eligibleMembers.filter((member) => drafts[member.id]?.selected).length
    const missingMedical = eligibleMembers.filter((member) => {
      const draft = drafts[member.id]
      return draft?.selected && !draft.medical
    }).length
    const missingLicense = eligibleMembers.filter((member) => {
      const draft = drafts[member.id]
      return draft?.selected && !draft.license.trim()
    }).length

    return {
      selectedCount,
      missingMedical,
      missingLicense,
      performanceGroupCount: eligibleMembers.filter((member) => member.base_group === "L-Gruppe").length,
      totalFights: eligibleMembers.reduce((sum, member) => {
        const draft = drafts[member.id]
        return draft?.selected ? sum + Number(draft.fights || 0) : sum
      }, 0),
    }
  }, [drafts, eligibleMembers])

  const hasActiveFilters =
    search.trim() !== "" || groupFilter !== "alle" || statusFilter !== "alle"

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Wettkampf</CardTitle>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Wettkampf</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung">Zurück zur Übersicht</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Akt. Wettkämpfer</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : summary.selectedCount}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">L-Gruppe</div>
            <div className="mt-1 text-3xl font-bold">{loading ? "…" : summary.performanceGroupCount}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Ohne Lizenznummer</div>
            <div className="mt-1 text-3xl font-bold text-amber-600">{loading ? "…" : summary.missingLicense}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Ohne Untersuchung</div>
            <div className="mt-1 text-3xl font-bold text-amber-600">{loading ? "…" : summary.missingMedical}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Kämpfe gesamt</div>
            <div className="mt-1 text-3xl font-bold">{loading ? "…" : summary.totalFights}</div>
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

          <div className="grid gap-4 md:grid-cols-3">
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
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle</SelectItem>
                  <SelectItem value="wettkampf">Wettkampfliste</SelectItem>
                  <SelectItem value="kader">Nur L-Gruppe</SelectItem>
                  <SelectItem value="offen">Noch nicht markiert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-100 p-3 text-sm text-zinc-700">
            <div>
              Sichtbar: <span className="font-semibold text-zinc-900">{filteredMembers.length}</span> von{" "}
              <span className="font-semibold text-zinc-900">{eligibleMembers.length}</span> Mitgliedern
              {groupFilter !== "alle" ? <span className="ml-2 text-zinc-500">· Gruppe: {groupFilter}</span> : null}
              {statusFilter !== "alle" ? <span className="ml-2 text-zinc-500">· Status: {statusFilter}</span> : null}
            </div>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                onClick={() => {
                  setSearch("")
                  setGroupFilter("alle")
                  setStatusFilter("alle")
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
          <CardTitle>Wettkämpferliste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Mitglieder und Gewichte werden geladen...</div>
          ) : competitionMembers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Noch keine Mitglieder für die Wettkampfliste markiert.</div>
          ) : (
            competitionMembers.map((member) => {
              const latestWeight = latestWeightByMember[member.id]
              const draft = drafts[member.id] ?? {
                hasPass: !!member.has_competition_pass,
                selected: !!member.is_competition_member,
                license: member.competition_license_number ?? "",
                targetWeight: member.competition_target_weight != null ? String(member.competition_target_weight).replace(".", ",") : "",
                medical: member.last_medical_exam_date ?? "",
                fights: String(member.competition_fights ?? 0),
                wins: String(member.competition_wins ?? 0),
                losses: String(member.competition_losses ?? 0),
                draws: String(member.competition_draws ?? 0),
              }
              const medicalStatus = getMedicalExamStatus(draft.medical)

              return (
                <form
                  key={member.id}
                  className="rounded-3xl border border-zinc-200 bg-white p-5"
                  onSubmit={async (event) => {
                    event.preventDefault()

                    try {
                      setSavingId(member.id)
                      const wasSelected = !!member.is_competition_member
                      await saveCompetitionDraft(member.id, draft)

                      if (!wasSelected && draft.selected && member.email) {
                        await fetch("/api/send-verification", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            purpose: "competition_assigned",
                            email: member.email,
                            name: getMemberDisplayName(member),
                          }),
                        })
                      }

                      if (wasSelected && !draft.selected && member.email) {
                        await fetch("/api/send-verification", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            purpose: "competition_removed",
                            email: member.email,
                            name: getMemberDisplayName(member),
                          }),
                        })
                      }

                      await loadData()
                      setOpenStatsMemberId((prev) => (prev === member.id ? "" : prev))
                    } catch (error) {
                      console.error(error)
                      alert("Fehler beim Speichern der Wettkampfdaten.")
                    } finally {
                      setSavingId("")
                    }
                  }}
                >
                  <div className="grid gap-5 xl:grid-cols-[1.35fr_1.35fr_auto] xl:items-start">
                    <div className="space-y-2 text-sm text-zinc-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                        {draft.selected ? (
                          <Badge variant="outline" className="border-red-200 bg-red-100 text-red-800">
                            Wettkämpfer
                          </Badge>
                        ) : null}
                        {member.base_group === "L-Gruppe" ? (
                          <Badge variant="outline" className="border-blue-200 bg-blue-100 text-blue-800">
                            Leistungsgruppe
                          </Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={getCompetitionAgeClassBadgeClass(member.birthdate)}
                        >
                          {getCompetitionAgeClass(member.birthdate)}
                        </Badge>
                      </div>
                      <div>Stammgruppe: {member.base_group || "—"}</div>
                      <div>Telefon: {member.phone || "—"}</div>
                      <div>E-Mail: {member.email || "—"}</div>
                      <div>Wettkampfpass: {draft.hasPass ? "vorhanden" : "offen"}</div>
                      <div>Zielgewicht: {draft.targetWeight.trim() ? `${draft.targetWeight} kg` : "—"}</div>
                      <div>
                        Letztes Gewicht:{" "}
                        <span className="font-semibold text-zinc-900">
                          {latestWeight?.weight != null ? `${latestWeight.weight} kg` : "nicht vorhanden"}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500">
                        {latestWeight?.created_at
                          ? `Erfasst am ${new Date(latestWeight.created_at).toLocaleString("de-DE")}`
                          : "Gewicht wird beim Einloggen übernommen."}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Button
                        type="button"
                        variant={draft.hasPass ? "outline" : "default"}
                        className={
                          draft.hasPass
                            ? "w-full justify-start rounded-2xl border-[#154c83]/30 bg-[#154c83]/10 text-left text-[#154c83] hover:bg-[#154c83]/15"
                            : "w-full justify-start rounded-2xl bg-[#154c83] text-left text-white hover:bg-[#123d69]"
                        }
                        onClick={() =>
                          setDrafts((prev) => ({
                            ...prev,
                            [member.id]: {
                              ...draft,
                              hasPass: !draft.hasPass,
                            },
                          }))
                        }
                      >
                        {draft.hasPass ? "Wettkampfpass hinterlegt" : "Wettkampfpass vorhanden"}
                      </Button>

                      {draft.hasPass ? (
                        <>
                          <div className="rounded-2xl bg-zinc-100 p-3 text-xs text-zinc-700">
                            Bilanz: <span className="font-semibold">{draft.fights}</span> Kämpfe · <span className="font-semibold">{draft.wins}</span> Siege · <span className="font-semibold">{draft.losses}</span> Niederlagen · <span className="font-semibold">{draft.draws}</span> Unentschieden
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Lizenznummer</Label>
                              <Input
                                value={draft.license}
                                onChange={(event) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [member.id]: { ...draft, license: event.target.value },
                                  }))
                                }
                                placeholder="Lizenznummer"
                                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Zielgewicht</Label>
                              <Input
                                value={draft.targetWeight}
                                onChange={(event) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [member.id]: { ...draft, targetWeight: event.target.value },
                                  }))
                                }
                                placeholder="z. B. 63,5"
                                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Letzte ärztliche Untersuchung</Label>
                              <Input
                                type="date"
                                value={draft.medical}
                                onChange={(event) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [member.id]: { ...draft, medical: event.target.value },
                                  }))
                                }
                                className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                              />
                              <div className={medicalStatus.boxClass}>{medicalStatus.message}</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">Ohne Pass keine Wettkampfdaten.</div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start rounded-2xl border-zinc-300 bg-white text-left text-zinc-900 hover:bg-zinc-50"
                        onClick={() =>
                          setOpenStatsMemberId((prev) => (prev === member.id ? "" : member.id))
                        }
                      >
                        Kampfstatistik ändern
                      </Button>
                      {openStatsMemberId === member.id && draft.hasPass ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Kämpfe</Label>
                            <Input
                              type="number"
                              min="0"
                              value={draft.fights}
                              onChange={(event) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [member.id]: { ...draft, fights: event.target.value },
                                }))
                              }
                              className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Siege</Label>
                            <Input
                              type="number"
                              min="0"
                              value={draft.wins}
                              onChange={(event) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [member.id]: { ...draft, wins: event.target.value },
                                }))
                              }
                              className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Niederlagen</Label>
                            <Input
                              type="number"
                              min="0"
                              value={draft.losses}
                              onChange={(event) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [member.id]: { ...draft, losses: event.target.value },
                                }))
                              }
                              className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Unentschieden</Label>
                            <Input
                              type="number"
                              min="0"
                              value={draft.draws}
                              onChange={(event) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [member.id]: { ...draft, draws: event.target.value },
                                }))
                              }
                              className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="flex flex-col gap-3">
                        <Button
                          type="button"
                          variant={draft.selected ? "outline" : "default"}
                          className={
                            draft.selected
                              ? "rounded-2xl border-[#154c83]/30 bg-[#154c83]/10 text-[#154c83] hover:bg-[#154c83]/15"
                              : "rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                          }
                          onClick={() =>
                            setDrafts((prev) => ({
                              ...prev,
                              [member.id]: { ...draft, selected: !draft.selected },
                            }))
                          }
                        >
                          {draft.selected ? "Aus WK Liste entfernen" : "Zur Wettkampfliste"}
                        </Button>
                        <Button
                          type="submit"
                          className="rounded-2xl"
                          disabled={savingId === member.id}
                        >
                          {savingId === member.id ? "Speichert..." : "Speichern"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Wettkämpfer delegieren</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            Nur freigegebene Mitglieder ohne aktive Wettkämpferliste. Boxzwerge sind hier ausgeschlossen.
          </div>

          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Kandidaten werden geladen...</div>
          ) : candidateMembers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine weiteren passenden Mitglieder zum Markieren gefunden.</div>
          ) : (
            <div className="space-y-4">
              {candidateMembers.map((member) => (
                <div key={`candidate-${member.id}`} className="rounded-3xl border border-zinc-200 bg-white p-6">
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_1.2fr]">
                      <div className="space-y-2 text-sm text-zinc-600">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Mitglied</div>
                        <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                        <div>Stammgruppe: {member.base_group || "—"}</div>
                      </div>
                      <div className="space-y-2 text-sm text-zinc-600">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Kontakt</div>
                        <div>E-Mail: {member.email || "—"}</div>
                        <div>Telefon: {member.phone || "—"}</div>
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <Button
                        type="button"
                        className="min-w-[260px] rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                        disabled={savingId === member.id}
                        onClick={async () => {
                          try {
                            setSavingId(member.id)
                            const draft = drafts[member.id] ?? {
                              hasPass: !!member.has_competition_pass,
                              selected: false,
                              license: "",
                              medical: "",
                              fights: "0",
                              wins: "0",
                              losses: "0",
                              draws: "0",
                            }

                            await saveCompetitionDraft(member.id, { ...draft, selected: true })

                            if (member.email) {
                              await fetch("/api/send-verification", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  purpose: "competition_assigned",
                                  email: member.email,
                                  name: getMemberDisplayName(member),
                                }),
                              })
                            }

                            await loadData()
                          } catch (error) {
                            console.error(error)
                            alert("Das Mitglied konnte nicht zur Wettkampfliste markiert werden.")
                          } finally {
                            setSavingId("")
                          }
                        }}
                      >
                        {savingId === member.id ? "Delegiert..." : "Als Wettkämpfer delegieren"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
