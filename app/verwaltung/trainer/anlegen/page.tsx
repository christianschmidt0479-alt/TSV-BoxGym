"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type RoleMemberRecord } from "@/lib/personRoles"
import { type TrainerAccountRecord } from "@/lib/trainerDb"
import { isTrainerPinCompliant, TRAINER_PIN_HINT, TRAINER_PIN_REQUIREMENTS_MESSAGE } from "@/lib/trainerPin"
import { trainerLicenseOptions } from "@/lib/trainerLicense"
import { compareTrainingGroupOrder, normalizeTrainingGroup } from "@/lib/trainingGroups"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

function getMemberDisplayName(member?: Partial<RoleMemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

function getEditableBoxClass(isActive: boolean) {
  return isActive
    ? "rounded-2xl border border-[#154c83]/30 bg-[#154c83]/[0.05] p-3 shadow-sm"
    : "rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-sm"
}

const inputClassName =
  "w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm outline-none transition focus:border-[#154c83] focus:ring-4 focus:ring-[#154c83]/10"

export default function TrainerAnlegenPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [members, setMembers] = useState<RoleMemberRecord[]>([])
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({})
  const [licenseDrafts, setLicenseDrafts] = useState<Record<string, string>>({})
  const [creatingMemberId, setCreatingMemberId] = useState<string | null>(null)

  async function loadCandidates() {
    setLoading(true)
    try {
      setLoadError("")
      const response = await fetch("/api/admin/person-roles", { cache: "no-store" })
      if (!response.ok) throw new Error("Mitgliederdaten konnten nicht geladen werden.")
      const payload = (await response.json()) as {
        members?: RoleMemberRecord[]
        trainers?: Array<Pick<TrainerAccountRecord, "linked_member_id" | "email">>
      }
      const membersPayload = Array.isArray(payload.members) ? payload.members : []
      const trainers = Array.isArray(payload.trainers) ? payload.trainers : []

      const trainerCandidates = membersPayload.filter((member: RoleMemberRecord) => {
        if (!member.email?.trim()) return false
        return !trainers.some(
          (trainer) =>
            trainer.linked_member_id === member.id || (trainer.email ?? "").trim().toLowerCase() === member.email!.trim().toLowerCase()
        )
      })

      setMembers(
        trainerCandidates.sort((a: RoleMemberRecord, b: RoleMemberRecord) => {
          const groupCompare = compareTrainingGroupOrder(a.base_group, b.base_group)
          if (groupCompare !== 0) return groupCompare
          return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b), "de")
        })
      )
    } catch (error) {
      console.error(error)
      setMembers([])
      setLoadError(error instanceof Error ? error.message : "Mitgliederdaten konnten nicht geladen werden.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }
    void loadCandidates()
  }, [authResolved, trainerRole])

  if (!authResolved) return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  if (trainerRole !== "admin")
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Trainer anlegen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Nur im Admin-Modus.</div>
          <Button asChild className="rounded-2xl">
            <Link href="/verwaltung">Zur Verwaltung</Link>
          </Button>
        </CardContent>
      </Card>
    )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trainer aus Mitgliederdaten anlegen</h1>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung/trainer">Zurück zur Trainerverwaltung</Link>
        </Button>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardContent className="space-y-3">
          {loadError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{loadError}</div> : null}
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Mitgliedsdaten werden geladen...</div>
          ) : members.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine weiteren Mitglieder mit E-Mail ohne verknüpftes Trainerkonto gefunden.</div>
          ) : (
            members.map((member) => (
              <div key={member.id} className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_1fr_auto] xl:items-end">
                  <div className="space-y-2 text-sm text-zinc-600">
                    <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                    <div>E-Mail: {member.email || "—"}</div>
                    <div>Stammgruppe: {normalizeTrainingGroup(member.base_group) || "—"}</div>
                    <div className="text-xs text-zinc-500">Das Trainerkonto wird mit den vorhandenen Mitgliedsdaten vorbereitet.</div>
                  </div>

                  <div className={getEditableBoxClass(Boolean(licenseDrafts[member.id]))}>
                    <Label className="flex items-center justify-between text-zinc-900">
                      <span>DOSB-Lizenz</span>
                      <span className="text-xs font-normal text-zinc-500">Auswahlfeld</span>
                    </Label>
                    <Select value={licenseDrafts[member.id] ?? trainerLicenseOptions[0]} onValueChange={(value) => setLicenseDrafts((c) => ({ ...c, [member.id]: value }))}>
                      <SelectTrigger className={`${inputClassName} mt-2`}>
                        <SelectValue placeholder="Lizenz auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {trainerLicenseOptions.map((license) => (
                          <SelectItem key={license} value={license}>
                            {license}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-2 text-xs text-zinc-500">Falls noch keine DOSB-Lizenz vorliegt, kann der Standardwert stehen bleiben.</div>
                  </div>

                  <div className={getEditableBoxClass(Boolean((pinDrafts[member.id] ?? "").trim()))}>
                    <Label className="flex items-center justify-between text-zinc-900">
                      <span>Start-Passwort *</span>
                      <span className="text-xs font-semibold text-amber-700">Pflichtfeld</span>
                    </Label>
                    <PasswordInput value={pinDrafts[member.id] ?? ""} onChange={(e) => setPinDrafts((c) => ({ ...c, [member.id]: e.target.value }))} placeholder="8 bis 64 Zeichen" className={`${inputClassName} mt-2`} />
                    <div className="mt-2 text-xs text-zinc-500">{TRAINER_PIN_HINT}</div>
                  </div>

                  <Button
                    type="button"
                    className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                    disabled={creatingMemberId === member.id}
                    onClick={async () => {
                      const pin = (pinDrafts[member.id] ?? "").trim()
                      const license = (licenseDrafts[member.id] ?? trainerLicenseOptions[0]) as (typeof trainerLicenseOptions)[number]

                      if (!member.email?.trim()) return alert("Für dieses Mitglied ist keine E-Mail hinterlegt.")
                      if (!isTrainerPinCompliant(pin)) return alert(TRAINER_PIN_REQUIREMENTS_MESSAGE)

                      try {
                        setCreatingMemberId(member.id)
                        const response = await fetch("/api/admin/trainer-account", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ firstName: member.first_name || "", lastName: member.last_name || "", email: member.email, trainerLicense: license, pin, linkedMemberId: member.id }),
                        })

                        if (!response.ok) {
                          const message = await response.text()
                          throw new Error(message || "Trainerkonto konnte nicht angelegt werden.")
                        }

                        setPinDrafts((c) => ({ ...c, [member.id]: "" }))
                        alert("Trainerkonto angelegt. Die Bestätigungs-Mail wurde versendet.")
                        await loadCandidates()
                      } catch (error) {
                        console.error(error)
                        alert(error instanceof Error ? error.message : "Trainerkonto konnte nicht angelegt werden.")
                      } finally {
                        setCreatingMemberId(null)
                      }
                    }}
                  >
                    {creatingMemberId === member.id ? "Legt an..." : "Trainerkonto anlegen"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
