"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { buildPersonRoleProfiles, type RoleMemberRecord } from "@/lib/personRoles"
import { isValidPin, PIN_HINT, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { trainerLicenseOptions } from "@/lib/trainerLicense"
import { compareTrainingGroupOrder, normalizeTrainingGroup } from "@/lib/trainingGroups"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

function getMemberDisplayName(member?: Partial<RoleMemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

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
      const payload = await response.json()
      const membersPayload = Array.isArray(payload.members) ? payload.members : []
      const trainers = Array.isArray(payload.trainers) ? payload.trainers : []

      const trainerCandidates = membersPayload.filter((member: RoleMemberRecord) => {
        if (!member.email?.trim()) return false
        return !trainers.some(
          (trainer: any) =>
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
              <div key={member.id} className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr_1fr_auto] xl:items-end">
                  <div className="space-y-2 text-sm text-zinc-600">
                    <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                    <div>E-Mail: {member.email || "—"}</div>
                    <div>Stammgruppe: {normalizeTrainingGroup(member.base_group) || "—"}</div>
                    <div className="text-xs text-zinc-500">Das Trainerkonto wird mit den vorhandenen Mitgliedsdaten vorbereitet.</div>
                  </div>

                  <div className="space-y-2">
                    <Label>Lizenz</Label>
                    <Select value={licenseDrafts[member.id] ?? trainerLicenseOptions[0]} onValueChange={(value) => setLicenseDrafts((c) => ({ ...c, [member.id]: value }))}>
                      <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
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
                  </div>

                  <div className="space-y-2">
                    <Label>Start-PIN</Label>
                    <PasswordInput value={pinDrafts[member.id] ?? ""} onChange={(e) => setPinDrafts((c) => ({ ...c, [member.id]: e.target.value }))} placeholder="6 bis 16 Zeichen" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                    <div className="text-xs text-zinc-500">{PIN_HINT}</div>
                  </div>

                  <Button
                    type="button"
                    className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                    disabled={creatingMemberId === member.id}
                    onClick={async () => {
                      const pin = (pinDrafts[member.id] ?? "").trim()
                      const license = (licenseDrafts[member.id] ?? trainerLicenseOptions[0]) as (typeof trainerLicenseOptions)[number]

                      if (!member.email?.trim()) return alert("Fuer dieses Mitglied ist keine E-Mail hinterlegt.")
                      if (!isValidPin(pin)) return alert(PIN_REQUIREMENTS_MESSAGE)

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
                        alert("Trainerkonto angelegt. Die Bestaetigungs-Mail wurde versendet.")
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
