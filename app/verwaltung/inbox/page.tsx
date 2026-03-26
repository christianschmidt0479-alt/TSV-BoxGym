"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TrainerAccountRecord } from "@/lib/trainerDb"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type PendingMemberRecord = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  email?: string | null
  email_verified?: boolean
  base_group?: string | null
}

type MemberRow = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  base_group?: string | null
}

type AdminQueueRow = {
  id: string
  kind: "member" | "trainer" | "boxzwerge"
  member_name: string
  created_at: string
}

type OutgoingQueueRow = {
  id: string
  purpose: "competition_assigned" | "competition_removed"
  name: string | null
  email: string
  created_at: string
}

function getMemberDisplayName(member?: Partial<MemberRow> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
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

export default function VerwaltungInboxPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [pendingMembers, setPendingMembers] = useState<PendingMemberRecord[]>([])
  const [trainers, setTrainers] = useState<TrainerAccountRecord[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [adminQueueRows, setAdminQueueRows] = useState<AdminQueueRow[]>([])
  const [outgoingQueueRows, setOutgoingQueueRows] = useState<OutgoingQueueRow[]>([])

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/admin/inbox", {
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          pendingMembers: PendingMemberRecord[]
          trainers: TrainerAccountRecord[]
          members: MemberRow[]
          adminQueueRows: AdminQueueRow[]
          outgoingQueueRows: OutgoingQueueRow[]
        }

        setPendingMembers(payload.pendingMembers ?? [])
        setTrainers(payload.trainers ?? [])
        setMembers(payload.members ?? [])
        setAdminQueueRows(payload.adminQueueRows ?? [])
        setOutgoingQueueRows(payload.outgoingQueueRows ?? [])
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, trainerRole])

  const inboxSummary = useMemo(() => {
    const trainerPending = trainers.filter((trainer) => !trainer.is_approved).length
    const trainerWaitingForMail = trainers.filter((trainer) => !trainer.email_verified).length
    const boxzwergeWarnings = members
      .filter((member) => member.base_group === "Boxzwerge")
      .map((member) => ({ ...member, age: getAgeInYears(member.birthdate) }))
      .filter((member) => (member.age ?? -1) >= 10)
      .sort((a, b) => (b.age ?? 0) - (a.age ?? 0))

    return {
      pendingMembers: pendingMembers.length,
      waitingForEmail: pendingMembers.filter((member) => !member.email_verified).length,
      trainerPending,
      trainerWaitingForMail,
      boxzwergeWarnings,
      adminMailOpen: adminQueueRows.length,
      outgoingMailOpen: outgoingQueueRows.length,
    }
  }, [adminQueueRows.length, members, outgoingQueueRows.length, pendingMembers, trainers])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Inbox</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung">Zurück zur Übersicht</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Mitglieder offen</div>
            <div className="mt-1 text-3xl font-bold text-amber-700">{loading ? "…" : inboxSummary.pendingMembers}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Trainer offen</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : inboxSummary.trainerPending}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Boxzwerge 10+</div>
            <div className="mt-1 text-3xl font-bold text-red-700">{loading ? "…" : inboxSummary.boxzwergeWarnings.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Mail offen</div>
            <div className="mt-1 text-3xl font-bold text-zinc-900">
              {loading ? "…" : inboxSummary.adminMailOpen + inboxSummary.outgoingMailOpen}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Jetzt prüfen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/verwaltung/freigaben" className="block rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-zinc-900">Mitglieder-Freigaben</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {loading ? "Lädt..." : `${inboxSummary.pendingMembers} offen, davon ${inboxSummary.waitingForEmail} warten noch auf E-Mail.`}
                  </div>
                </div>
                <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800">
                  Priorität
                </Badge>
              </div>
            </Link>

            <Link href="/verwaltung/trainer" className="block rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-zinc-900">Trainer-Anträge</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {loading ? "Lädt..." : `${inboxSummary.trainerPending} offen, ${inboxSummary.trainerWaitingForMail} ohne bestätigte E-Mail.`}
                  </div>
                </div>
                <Badge variant="outline" className="border-blue-200 bg-blue-100 text-blue-800">
                  Rollen
                </Badge>
              </div>
            </Link>

            <Link href="/verwaltung/mitglieder?gruppe=Boxzwerge" className="block rounded-3xl border border-red-200 bg-red-50 p-4 transition hover:border-red-400 hover:bg-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-red-900">Boxzwerge 10+</div>
                  <div className="mt-1 text-sm text-red-800">
                    {loading ? "Lädt..." : `${inboxSummary.boxzwergeWarnings.length} Datensätze brauchen eine Prüfung.`}
                  </div>
                </div>
                <Badge variant="outline" className="border-red-200 bg-white text-red-800">
                  Sofort
                </Badge>
              </div>
            </Link>

            <Link href="/verwaltung/mail" className="block rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-zinc-900">Mail-Queue</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {loading ? "Lädt..." : `${inboxSummary.adminMailOpen} Sammelmail, ${inboxSummary.outgoingMailOpen} Wettkampf-Mails offen.`}
                  </div>
                </div>
                <Badge variant="outline" className="border-zinc-200 bg-zinc-100 text-zinc-700">
                  Kommunikation
                </Badge>
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Konkrete Fälle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {inboxSummary.boxzwergeWarnings.length === 0 ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
                Keine Boxzwerge mit Warnstatus offen.
              </div>
            ) : (
              inboxSummary.boxzwergeWarnings.slice(0, 6).map((member) => (
                <div key={member.id} className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <div className="font-semibold">{getMemberDisplayName(member)}</div>
                  <div className="mt-1">
                    {member.birthdate || "Geburtsdatum offen"} · {member.age} Jahre
                  </div>
                </div>
              ))
            )}

            {adminQueueRows.slice(0, 3).map((row) => (
              <div key={row.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">{row.member_name}</div>
                <div className="mt-1">
                  Admin-Sammelmail · {new Date(row.created_at).toLocaleString("de-DE")}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
