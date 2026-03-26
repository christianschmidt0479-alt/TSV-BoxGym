"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAllMembers } from "@/lib/boxgymDb"
import { buildPersonRoleProfiles, type RoleMemberRecord } from "@/lib/personRoles"
import {
  approveTrainerAccount,
  getAllTrainerAccounts,
  trainerLicenseOptions,
  type TrainerAccountRecord,
  updateTrainerAccountRole,
} from "@/lib/trainerDb"
import { isValidPin, PIN_HINT, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

function getTrainerDisplayName(trainer: TrainerAccountRecord) {
  return `${trainer.first_name} ${trainer.last_name}`.trim()
}

function getMemberDisplayName(member?: Partial<RoleMemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

export default function TrainerverwaltungPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [trainers, setTrainers] = useState<TrainerAccountRecord[]>([])
  const [members, setMembers] = useState<RoleMemberRecord[]>([])
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({})
  const [licenseDrafts, setLicenseDrafts] = useState<Record<string, string>>({})
  const [creatingMemberId, setCreatingMemberId] = useState<string | null>(null)

  async function loadTrainers() {
    setLoading(true)
    try {
      const [trainerRows, memberRows] = await Promise.all([getAllTrainerAccounts(), getAllMembers()])
      setTrainers(trainerRows)
      setMembers((memberRows as RoleMemberRecord[]) ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    void loadTrainers()
  }, [authResolved, trainerRole])

  const admins = useMemo(() => trainers.filter((trainer) => trainer.role === "admin"), [trainers])
  const pending = useMemo(() => trainers.filter((trainer) => trainer.role !== "admin" && !trainer.is_approved), [trainers])
  const approved = useMemo(() => trainers.filter((trainer) => trainer.role !== "admin" && trainer.is_approved), [trainers])
  const roleProfiles = useMemo(() => buildPersonRoleProfiles(members, trainers), [members, trainers])
  const trainerCandidates = useMemo(() => {
    return members.filter((member) => {
      if (member.base_group !== "Trainer") return false
      if (!member.email?.trim()) return false

      return !trainers.some(
        (trainer) =>
          trainer.linked_member_id === member.id ||
          trainer.email.trim().toLowerCase() === member.email!.trim().toLowerCase()
      )
    })
  }, [members, trainers])

  function getRoleSummary(trainer: TrainerAccountRecord) {
    const profile = roleProfiles.find((entry) => entry.trainer?.id === trainer.id)
    if (!profile) return []

    return profile.roles.filter((role) => role !== "trainer" && role !== "admin")
  }

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Trainerverwaltung</CardTitle>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Trainerverwaltung</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung">Zurück zur Übersicht</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Trainerkonten gesamt</div>
            <div className="mt-1 text-3xl font-bold">{loading ? "…" : approved.length + pending.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Offene Freigaben</div>
            <div className="mt-1 text-3xl font-bold text-amber-600">{loading ? "…" : pending.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Freigegeben</div>
            <div className="mt-1 text-3xl font-bold text-green-700">{loading ? "…" : approved.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Admins</div>
            <div className="mt-1 text-3xl font-bold text-red-600">{loading ? "…" : admins.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Trainer aus Mitgliederdaten anlegen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Mitgliedsdaten werden geladen...</div>
          ) : trainerCandidates.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
              Keine weiteren Mitglieder aus der Gruppe `Trainer` ohne Trainerkonto gefunden.
            </div>
          ) : (
            trainerCandidates.map((member) => (
              <div key={member.id} className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr_1fr_auto] xl:items-end">
                  <div className="space-y-2 text-sm text-zinc-600">
                    <div className="text-lg font-semibold text-zinc-900">{getMemberDisplayName(member)}</div>
                    <div>E-Mail: {member.email || "—"}</div>
                    <div>Stammgruppe: {member.base_group || "—"}</div>
                    <div className="text-xs text-zinc-500">
                      Das Trainerkonto wird mit den vorhandenen Mitgliedsdaten vorbereitet. Die E-Mail muss danach noch bestaetigt werden und die Freigabe erfolgt separat.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Lizenz</Label>
                    <Select
                      value={licenseDrafts[member.id] ?? trainerLicenseOptions[0]}
                      onValueChange={(value) =>
                        setLicenseDrafts((current) => ({ ...current, [member.id]: value }))
                      }
                    >
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
                    <PasswordInput
                      value={pinDrafts[member.id] ?? ""}
                      onChange={(event) =>
                        setPinDrafts((current) => ({ ...current, [member.id]: event.target.value }))
                      }
                      placeholder="6 bis 16 Zeichen"
                      className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                    <div className="text-xs text-zinc-500">{PIN_HINT}</div>
                  </div>

                  <Button
                    type="button"
                    className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                    disabled={creatingMemberId === member.id}
                    onClick={async () => {
                      const pin = (pinDrafts[member.id] ?? "").trim()
                      const license = licenseDrafts[member.id] ?? trainerLicenseOptions[0]

                      if (!member.email?.trim()) {
                        alert("Fuer dieses Mitglied ist keine E-Mail hinterlegt.")
                        return
                      }

                      if (!isValidPin(pin)) {
                        alert(PIN_REQUIREMENTS_MESSAGE)
                        return
                      }

                      try {
                        setCreatingMemberId(member.id)
                        const response = await fetch("/api/admin/trainer-account", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            firstName: member.first_name || "",
                            lastName: member.last_name || "",
                            email: member.email,
                            trainerLicense: license as (typeof trainerLicenseOptions)[number],
                            pin,
                            linkedMemberId: member.id,
                          }),
                        })

                        if (!response.ok) {
                          const message = await response.text()
                          throw new Error(message || "Trainerkonto konnte nicht angelegt werden.")
                        }

                        setPinDrafts((current) => ({ ...current, [member.id]: "" }))
                        alert("Trainerkonto angelegt. Die Bestaetigungs-Mail wurde versendet.")
                        await loadTrainers()
                      } catch (error) {
                        console.error(error)
                        const message = error instanceof Error ? error.message : "Trainerkonto konnte nicht angelegt werden."
                        alert(message)
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

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Offene Trainerzugänge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Trainerkonten werden geladen...</div>
          ) : pending.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine offenen Trainerfreigaben vorhanden.</div>
          ) : (
            pending.map((trainer) => (
              <div key={trainer.id} className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="grid gap-4 xl:grid-cols-[1.4fr_auto] xl:items-end">
                  <div className="space-y-2 text-sm text-zinc-600">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold text-zinc-900">{getTrainerDisplayName(trainer)}</div>
                      <Badge
                        variant="outline"
                        className={
                          trainer.email_verified
                            ? "border-blue-200 bg-blue-100 text-blue-800"
                            : "border-zinc-200 bg-zinc-100 text-zinc-700"
                        }
                      >
                        {trainer.email_verified ? "E-Mail bestätigt" : "Wartet auf E-Mail"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          trainer.is_approved
                            ? "border-green-200 bg-green-100 text-green-800"
                            : "border-amber-200 bg-amber-100 text-amber-800"
                        }
                      >
                        {trainer.is_approved ? "Freigegeben" : "Freigabe offen"}
                      </Badge>
                    </div>
                    <div>E-Mail: {trainer.email}</div>
                    <div>Lizenz: {trainer.trainer_license || "—"}</div>
                    <div>Registriert am: {new Date(trainer.created_at).toLocaleString("de-DE")}</div>
                    <div>
                      E-Mail-Bestätigung:{" "}
                      {trainer.email_verified_at ? new Date(trainer.email_verified_at).toLocaleString("de-DE") : "noch offen"}
                    </div>
                    {getRoleSummary(trainer).length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {getRoleSummary(trainer).map((role) => (
                          <Badge key={role} variant="outline" className="border-blue-200 bg-blue-100 text-blue-800">
                            {role === "mitglied" ? "Auch Mitglied" : role === "wettkaempfer" ? "Auch Wettkämpfer" : role}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <Button
                    className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                    onClick={async () => {
                      if (!trainer.email_verified) {
                        const confirmed = window.confirm(
                          "E-Mail ist noch nicht bestätigt. Trotzdem freigeben und Benachrichtigung senden?"
                        )
                        if (!confirmed) return
                      }

                      try {
                        await approveTrainerAccount(trainer.id)
                        await fetch("/api/send-verification", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            purpose: "approval_notice",
                            email: trainer.email,
                            name: getTrainerDisplayName(trainer),
                            kind: "trainer",
                            group: "Trainer",
                          }),
                        })
                        alert("Trainerzugang freigegeben.")
                        await loadTrainers()
                      } catch (error) {
                        console.error(error)
                        alert("Fehler bei der Trainerfreigabe.")
                      }
                    }}
                  >
                    Freigeben
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Admins</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Admin-Konten werden geladen...</div>
          ) : admins.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Noch keine Admin-Konten vorhanden.</div>
          ) : (
            admins.map((trainer) => (
              <div key={trainer.id} className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold">{getTrainerDisplayName(trainer)}</div>
                  <Badge variant="outline" className="border-red-200 bg-white text-red-700">
                    Admin
                  </Badge>
                  {trainer.is_approved ? (
                    <Badge variant="outline" className="border-green-200 bg-green-100 text-green-800">
                      Freigegeben
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1">{trainer.email}</div>
                <div className="mt-1">Lizenz: {trainer.trainer_license || "—"}</div>
                <div className="mt-1 text-xs text-red-700">
                  Freigegeben am: {trainer.approved_at ? new Date(trainer.approved_at).toLocaleString("de-DE") : "—"}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Freigegebene Trainer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Trainerkonten werden geladen...</div>
          ) : approved.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Noch keine freigegebenen Trainer vorhanden.</div>
          ) : (
            approved.map((trainer) => (
              <div key={trainer.id} className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">{getTrainerDisplayName(trainer)}</div>
                <div className="mt-1">{trainer.email}</div>
                <div className="mt-1">Lizenz: {trainer.trainer_license || "—"}</div>
                <div className="text-xs text-zinc-500">
                  Freigegeben am: {trainer.approved_at ? new Date(trainer.approved_at).toLocaleString("de-DE") : "—"}
                </div>
                {getRoleSummary(trainer).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {getRoleSummary(trainer).map((role) => (
                      <Badge key={role} variant="outline" className="border-blue-200 bg-blue-100 text-blue-800">
                        {role === "mitglied" ? "Auch Mitglied" : role === "wettkaempfer" ? "Auch Wettkämpfer" : role}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl"
                    onClick={async () => {
                      try {
                        await updateTrainerAccountRole(trainer.id, "admin")
                        alert("Konto in die Admin-Liste verschoben.")
                        await loadTrainers()
                      } catch (error) {
                        console.error(error)
                        alert("Fehler beim Verschieben in die Admin-Liste.")
                      }
                    }}
                  >
                    In Admin-Liste verschieben
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
