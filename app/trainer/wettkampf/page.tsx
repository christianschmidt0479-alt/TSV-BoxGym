"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type CompetitionMemberRow = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  email?: string | null
  phone?: string | null
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

type WeightRow = {
  member_id: string
  weight: number | null
  created_at: string
  date: string
  group_name: string
}

function getMemberDisplayName(member?: Partial<CompetitionMemberRow> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

function getAgeInYears(birthdate?: string) {
  if (!birthdate) return null
  const today = new Date()
  const birth = new Date(`${birthdate}T12:00:00`)
  let age = today.getFullYear() - birth.getFullYear()
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())

  if (!hasHadBirthdayThisYear) age -= 1
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

type CompetitionDraft = {
  hasPass: boolean
  license: string
  targetWeight: string
  medical: string
  fights: string
  wins: string
  losses: string
  draws: string
}

function hasCompetitionProfile(member: CompetitionMemberRow) {
  return Boolean(
    member.has_competition_pass ||
    member.is_competition_member ||
      (member.competition_license_number ?? "").trim() ||
      member.last_medical_exam_date ||
      (member.competition_fights ?? 0) > 0 ||
      (member.competition_wins ?? 0) > 0 ||
      (member.competition_losses ?? 0) > 0 ||
      (member.competition_draws ?? 0) > 0
  )
}

export default function TrainerWettkampfPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [members, setMembers] = useState<CompetitionMemberRow[]>([])
  const [weightRows, setWeightRows] = useState<WeightRow[]>([])
  const [viewerRole, setViewerRole] = useState<"trainer" | "admin" | null>(null)
  const [drafts, setDrafts] = useState<Record<string, CompetitionDraft>>({})

  async function loadCompetitionData() {
    setLoading(true)
    try {
      const response = await fetch("/api/trainer/competition", { cache: "no-store" })
      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as {
        members: CompetitionMemberRow[]
        weightRows: WeightRow[]
        viewerRole: "trainer" | "admin"
      }

      setMembers(payload.members ?? [])
      setWeightRows(payload.weightRows ?? [])
      setViewerRole(payload.viewerRole ?? null)
      const nextDrafts: Record<string, CompetitionDraft> = {}
      for (const member of payload.members ?? []) {
        nextDrafts[member.id] = {
          hasPass: !!member.has_competition_pass,
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
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authResolved || !trainerRole) {
      setLoading(false)
      return
    }

    void loadCompetitionData()
  }, [authResolved, trainerRole])

  const latestWeightByMember = useMemo(() => {
    const nextWeights: Record<string, WeightRow> = {}
    for (const row of weightRows) {
      if (!nextWeights[row.member_id]) {
        nextWeights[row.member_id] = row
      }
    }
    return nextWeights
  }, [weightRows])

  const filteredMembers = useMemo(() => {
    const trimmed = search.trim().toLowerCase()

    return members
      .filter((member) => hasCompetitionProfile(member))
      .filter((member) => {
        if (trimmed === "") return true
        return (
          getMemberDisplayName(member).toLowerCase().includes(trimmed) ||
          (member.base_group ?? "").toLowerCase().includes(trimmed) ||
          (member.email ?? "").toLowerCase().includes(trimmed)
        )
      })
      .sort((a, b) => {
        const aActive = !!a.is_competition_member
        const bActive = !!b.is_competition_member
        if (aActive !== bActive) return aActive ? -1 : 1
        return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))
      })
  }, [members, search])

  const activeMembers = useMemo(() => filteredMembers.filter((member) => !!member.is_competition_member), [filteredMembers])
  const inactiveMembers = useMemo(
    () => filteredMembers.filter((member) => !!member.has_competition_pass && !member.is_competition_member),
    [filteredMembers]
  )
  const pendingMembers = useMemo(
    () => filteredMembers.filter((member) => !member.has_competition_pass),
    [filteredMembers]
  )

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (!trainerRole) {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Wettkampf</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nur mit Trainer- oder Adminzugang.</div>
          <Button asChild className="rounded-2xl">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const renderMemberCard = (member: CompetitionMemberRow) => {
    const latestWeight = latestWeightByMember[member.id] ?? null
    const draft = drafts[member.id] ?? {
      hasPass: !!member.has_competition_pass,
      license: member.competition_license_number ?? "",
      targetWeight: member.competition_target_weight != null ? String(member.competition_target_weight).replace(".", ",") : "",
      medical: member.last_medical_exam_date ?? "",
      fights: String(member.competition_fights ?? 0),
      wins: String(member.competition_wins ?? 0),
      losses: String(member.competition_losses ?? 0),
      draws: String(member.competition_draws ?? 0),
    }

    return (
      <div key={member.id} className="rounded-3xl border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 xl:grid-cols-[1.3fr_auto] xl:items-start">
          <div className="space-y-2 text-sm text-zinc-600">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
              <Badge
                variant="outline"
                className={
                  member.is_competition_member
                    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                    : member.has_competition_pass
                      ? "border-blue-200 bg-blue-100 text-blue-800"
                      : "border-zinc-200 bg-zinc-100 text-zinc-700"
                }
              >
                {member.is_competition_member ? "Aktiv" : member.has_competition_pass ? "Inaktiv" : "Ohne Pass"}
              </Badge>
            </div>
            <div>Stammgruppe: {member.base_group || "—"}</div>
            <div>Altersklasse: {getCompetitionAgeClass(member.birthdate)}</div>
            <div>Wettkampfpass: {member.has_competition_pass ? "vorhanden" : "offen"}</div>
            {member.has_competition_pass ? (
              <>
                <div>Lizenznummer: {member.competition_license_number || "—"}</div>
                <div>Untersuchung: {member.last_medical_exam_date || "—"}</div>
                <div>
                  Bilanz: {member.competition_fights ?? 0} Kämpfe · {member.competition_wins ?? 0} Siege · {member.competition_losses ?? 0} Niederlagen · {member.competition_draws ?? 0} Unentschieden
                </div>
              </>
            ) : null}
            <div>
              Letztes Gewicht:{" "}
              <span className="font-semibold text-zinc-900">
                {latestWeight?.weight != null ? `${String(latestWeight.weight).replace(".", ",")} kg` : "—"}
              </span>
            </div>
            <div>
              Zielgewicht:{" "}
              <span className="font-semibold text-zinc-900">
                {member.competition_target_weight != null ? `${String(member.competition_target_weight).replace(".", ",")} kg` : "—"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant={draft.hasPass ? "outline" : "default"}
              className={
                draft.hasPass
                  ? "rounded-2xl border-[#154c83]/30 bg-[#154c83]/10 text-[#154c83] hover:bg-[#154c83]/15"
                  : "rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
              }
              disabled={savingId === member.id}
              onClick={async () => {
                try {
                  setSavingId(member.id)
                  const response = await fetch("/api/trainer/competition-profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      memberId: member.id,
                      hasCompetitionPass: !draft.hasPass,
                      competitionLicenseNumber: draft.license,
                      competitionTargetWeight: draft.targetWeight.trim() ? Number(draft.targetWeight.replace(",", ".")) : undefined,
                      lastMedicalExamDate: draft.medical,
                      competitionFights: Number(draft.fights || 0),
                      competitionWins: Number(draft.wins || 0),
                      competitionLosses: Number(draft.losses || 0),
                      competitionDraws: Number(draft.draws || 0),
                    }),
                  })
                  if (!response.ok) {
                    throw new Error(await response.text())
                  }
                  const payload = (await response.json()) as { member: CompetitionMemberRow }
                  const updated = payload.member
                  setMembers((current) => current.map((row) => (row.id === member.id ? { ...row, ...updated } : row)))
                  setDrafts((current) => ({
                    ...current,
                      [member.id]: {
                        hasPass: !!updated.has_competition_pass,
                        license: updated.competition_license_number ?? "",
                        targetWeight: updated.competition_target_weight != null ? String(updated.competition_target_weight).replace(".", ",") : "",
                        medical: updated.last_medical_exam_date ?? "",
                      fights: String(updated.competition_fights ?? 0),
                      wins: String(updated.competition_wins ?? 0),
                      losses: String(updated.competition_losses ?? 0),
                      draws: String(updated.competition_draws ?? 0),
                    },
                  }))
                } catch (error) {
                  console.error(error)
                  alert("Der Wettkampfpass konnte nicht gespeichert werden.")
                } finally {
                  setSavingId(null)
                }
              }}
            >
              {savingId === member.id ? "Speichert..." : draft.hasPass ? "Wettkampfpass entfernen" : "Wettkampfpass vorhanden"}
            </Button>

            {draft.hasPass ? (
              <>
                <div className="space-y-2">
                  <Label>Lizenznummer</Label>
                  <Input
                    value={draft.license}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [member.id]: { ...draft, license: event.target.value } }))
                    }
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Zielgewicht</Label>
                  <Input
                    value={draft.targetWeight}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [member.id]: { ...draft, targetWeight: event.target.value } }))
                    }
                    placeholder="z. B. 63,5"
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Letzte Untersuchung</Label>
                  <Input
                    type="date"
                    value={draft.medical}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [member.id]: { ...draft, medical: event.target.value } }))
                    }
                    className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Kämpfe</Label>
                    <Input type="number" min="0" value={draft.fights} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, fights: event.target.value } }))} className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                  </div>
                  <div className="space-y-2">
                    <Label>Siege</Label>
                    <Input type="number" min="0" value={draft.wins} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, wins: event.target.value } }))} className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                  </div>
                  <div className="space-y-2">
                    <Label>Niederlagen</Label>
                    <Input type="number" min="0" value={draft.losses} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, losses: event.target.value } }))} className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                  </div>
                  <div className="space-y-2">
                    <Label>Unentschieden</Label>
                    <Input type="number" min="0" value={draft.draws} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, draws: event.target.value } }))} className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl"
                  disabled={savingId === member.id}
                  onClick={async () => {
                    try {
                      setSavingId(member.id)
                      const response = await fetch("/api/trainer/competition-profile", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          memberId: member.id,
                          hasCompetitionPass: true,
                          competitionLicenseNumber: draft.license,
                          competitionTargetWeight: draft.targetWeight.trim() ? Number(draft.targetWeight.replace(",", ".")) : undefined,
                          lastMedicalExamDate: draft.medical,
                          competitionFights: Number(draft.fights || 0),
                          competitionWins: Number(draft.wins || 0),
                          competitionLosses: Number(draft.losses || 0),
                          competitionDraws: Number(draft.draws || 0),
                        }),
                      })
                      if (!response.ok) {
                        throw new Error(await response.text())
                      }
                      const payload = (await response.json()) as { member: CompetitionMemberRow }
                      const updated = payload.member
                      setMembers((current) => current.map((row) => (row.id === member.id ? { ...row, ...updated } : row)))
                    } catch (error) {
                      console.error(error)
                      alert("Die Wettkampfdaten konnten nicht gespeichert werden.")
                    } finally {
                      setSavingId(null)
                    }
                  }}
                >
                  {savingId === member.id ? "Speichert..." : "Wettkampfdaten speichern"}
                </Button>
              </>
            ) : null}

          {viewerRole === "admin" ? (
            <>
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant={member.is_competition_member ? "outline" : "default"}
                className={
                  member.is_competition_member
                    ? "rounded-2xl border-[#154c83]/30 bg-[#154c83]/10 text-[#154c83] hover:bg-[#154c83]/15"
                    : "rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                }
                disabled={savingId === member.id}
                onClick={async () => {
                  try {
                    setSavingId(member.id)
                    const response = await fetch("/api/admin/member-action", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "set_competition",
                        memberId: member.id,
                        isCompetitionMember: !member.is_competition_member,
                        hasCompetitionPass: !!member.has_competition_pass,
                        competitionLicenseNumber: member.competition_license_number ?? undefined,
                        lastMedicalExamDate: member.last_medical_exam_date ?? undefined,
                        competitionFights: member.competition_fights ?? 0,
                        competitionWins: member.competition_wins ?? 0,
                        competitionLosses: member.competition_losses ?? 0,
                        competitionDraws: member.competition_draws ?? 0,
                      }),
                    })
                    if (!response.ok) {
                      throw new Error(await response.text())
                    }

                    const payload = (await response.json()) as { member: CompetitionMemberRow }
                    const updated = payload.member
                    setMembers((current) =>
                      current.map((row) =>
                        row.id === member.id
                          ? {
                              ...row,
                              is_competition_member: updated.is_competition_member,
                              competition_target_weight: updated.competition_target_weight,
                            }
                          : row
                      )
                    )
                  } catch (error) {
                  console.error(error)
                    alert(error instanceof Error ? error.message : "Der Wettkampfstatus konnte nicht geändert werden.")
                  } finally {
                    setSavingId(null)
                  }
                }}
              >
                {savingId === member.id
                  ? "Speichert..."
                  : member.is_competition_member
                    ? "Auf inaktiv setzen"
                    : "Auf aktiv setzen"}
              </Button>
            </div>
            </>
          ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Wettkampf</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/trainer">Zurück zur Übersicht</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Wettkämpfer gesamt</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : filteredMembers.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Aktiv</div>
            <div className="mt-1 text-3xl font-bold text-emerald-700">{loading ? "…" : activeMembers.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Inaktiv</div>
            <div className="mt-1 text-3xl font-bold text-zinc-700">{loading ? "…" : inactiveMembers.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Suche</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, Gruppe oder E-Mail"
              className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Aktive Wettkämpfer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Wettkämpfer werden geladen...</div>
          ) : activeMembers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine aktiven Wettkämpfer gefunden.</div>
          ) : (
            activeMembers.map(renderMemberCard)
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Inaktive Wettkämpfer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Wettkämpfer werden geladen...</div>
          ) : inactiveMembers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine inaktiven Wettkämpfer gefunden.</div>
          ) : (
            inactiveMembers.map(renderMemberCard)
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Pass offen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Wettkämpfer werden geladen...</div>
          ) : pendingMembers.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine offenen Pass-Einträge.</div>
          ) : (
            pendingMembers.map(renderMemberCard)
          )}
        </CardContent>
      </Card>
    </div>
  )
}
