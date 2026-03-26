"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { approveMember, getAllMembers } from "@/lib/boxgymDb"
import {
  buildPersonRoleProfiles,
  getPersonRoleState,
  type PersonRole,
  type PersonRoleProfile,
  type RoleMemberRecord,
} from "@/lib/personRoles"
import {
  approveTrainerAccount,
  getAllTrainerAccounts,
  type TrainerAccountRecord,
  updateTrainerAccountRole,
} from "@/lib/trainerDb"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

function getRoleLabel(role: PersonRoleProfile["roles"][number]) {
  switch (role) {
    case "mitglied":
      return "Mitglied"
    case "trainer":
      return "Trainer"
    case "admin":
      return "Admin"
    case "wettkaempfer":
      return "Wettkämpfer"
  }
}

function getRoleClass(role: PersonRoleProfile["roles"][number]) {
  switch (role) {
    case "mitglied":
      return "border-blue-200 bg-blue-100 text-blue-800"
    case "trainer":
      return "border-zinc-200 bg-zinc-100 text-zinc-700"
    case "admin":
      return "border-red-200 bg-red-100 text-red-800"
    case "wettkaempfer":
      return "border-amber-200 bg-amber-100 text-amber-800"
  }
}

function getRoleStateLabel(state: ReturnType<typeof getPersonRoleState>) {
  return state === "bestaetigt" ? "Bestätigt" : "Offen"
}

function getRoleStateClass(state: ReturnType<typeof getPersonRoleState>) {
  return state === "bestaetigt"
    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
    : "border-amber-200 bg-amber-100 text-amber-800"
}

function getMatchLabel(profile: PersonRoleProfile) {
  switch (profile.matchedBy) {
    case "linked_member_id":
      return "fest verknüpft"
    case "email":
      return "über gleiche E-Mail erkannt"
    case "single":
      return "einzelner Datensatz"
  }
}

export default function PersonenPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState("")
  const [search, setSearch] = useState("")
  const [profiles, setProfiles] = useState<PersonRoleProfile[]>([])

  async function loadProfiles() {
    setLoading(true)
    try {
      const [members, trainers] = await Promise.all([getAllMembers(), getAllTrainerAccounts()])
      setProfiles(
        buildPersonRoleProfiles(
          (members as RoleMemberRecord[]) ?? [],
          (trainers as TrainerAccountRecord[]) ?? []
        )
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    void loadProfiles()
  }, [authResolved, trainerRole])

  async function confirmRole(profile: PersonRoleProfile, role: PersonRole) {
    const actionKey = `${profile.key}:${role}`
    setSavingKey(actionKey)

    try {
      if (role === "mitglied" && profile.member?.id) {
        await approveMember(profile.member.id)
      } else if ((role === "trainer" || role === "admin") && profile.trainer?.id) {
        if (role === "admin" && profile.trainer.role !== "admin") {
          await updateTrainerAccountRole(profile.trainer.id, "admin")
        }
        await approveTrainerAccount(profile.trainer.id)
      }

      await loadProfiles()
    } catch (error) {
      console.error(error)
      alert("Die Rollenbestätigung konnte nicht gespeichert werden.")
    } finally {
      setSavingKey("")
    }
  }

  const filteredProfiles = useMemo(() => {
    const trimmed = search.trim().toLowerCase()
    if (!trimmed) return profiles

    return profiles.filter((profile) => {
      return (
        profile.displayName.toLowerCase().includes(trimmed) ||
        profile.email.toLowerCase().includes(trimmed) ||
        profile.roles.some((role) => getRoleLabel(role).toLowerCase().includes(trimmed)) ||
        (profile.member?.base_group ?? "").toLowerCase().includes(trimmed)
      )
    })
  }, [profiles, search])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Personen & Rollen</CardTitle>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Personen & Rollen</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung">Zurück zur Übersicht</Link>
        </Button>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Suche</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, E-Mail, Rolle oder Stammgruppe"
            className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
          />
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Rollenübersicht</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Personen werden geladen...</div>
          ) : filteredProfiles.length === 0 ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Keine passenden Personen gefunden.</div>
          ) : (
            filteredProfiles.map((profile) => (
              <div key={profile.key} className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-zinc-900">{profile.displayName}</div>
                    <div className="mt-1 text-sm text-zinc-600">{profile.email || "Keine E-Mail hinterlegt"}</div>
                    <div className="mt-1 text-xs text-zinc-500">{getMatchLabel(profile)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile.roles.map((role) => (
                      <Badge key={role} variant="outline" className={getRoleClass(role)}>
                        {getRoleLabel(role)}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
                    <div className="font-semibold text-zinc-900">Mitgliedsdaten</div>
                    <div className="mt-2">Stammgruppe: {profile.member?.base_group || "—"}</div>
                    <div>Wettkämpfer: {profile.member?.is_competition_member ? "ja" : "nein"}</div>
                  </div>
                  <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
                    <div className="font-semibold text-zinc-900">Trainerdaten</div>
                    <div className="mt-2">Rolle: {profile.trainer?.role || "—"}</div>
                    <div>Freigegeben: {profile.trainer?.is_approved ? "ja" : "nein"}</div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-zinc-100 p-4">
                  <div className="text-sm font-semibold text-zinc-900">Rollenbestätigung</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {profile.roles.map((role) => {
                      const state = getPersonRoleState(profile, role)
                      const isPending =
                        (role === "mitglied" && !!profile.member && state === "offen") ||
                        ((role === "trainer" || role === "admin") && !!profile.trainer && state === "offen")

                      return (
                        <div key={role} className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={getRoleClass(role)}>
                              {getRoleLabel(role)}
                            </Badge>
                            <Badge variant="outline" className={getRoleStateClass(state)}>
                              {getRoleStateLabel(state)}
                            </Badge>
                          </div>
                          {role === "wettkaempfer" ? (
                            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                              <span>Bestätigung über Wettkampfliste.</span>
                              <InfoHint text="Diese Rolle gilt als bestätigt, sobald der Admin sie in der Wettkampfliste markiert." />
                            </div>
                          ) : null}
                          {isPending ? (
                            <Button
                              type="button"
                              size="sm"
                              className="mt-3 rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                              disabled={savingKey === `${profile.key}:${role}`}
                              onClick={() => void confirmRole(profile, role)}
                            >
                              {savingKey === `${profile.key}:${role}` ? "Speichert..." : `${getRoleLabel(role)} bestätigen`}
                            </Button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
