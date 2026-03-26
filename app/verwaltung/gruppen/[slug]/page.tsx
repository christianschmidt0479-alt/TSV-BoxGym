"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getGroupBySlug, sessions } from "@/lib/boxgymSessions"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type GroupMemberRow = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  email?: string | null
  is_trial?: boolean
  is_approved?: boolean
  base_group?: string | null
}

type GroupCheckinRow = {
  id: string
  member_id: string
  group_name: string
  date: string
  time: string
}

function getMemberDisplayName(member?: Partial<GroupMemberRow> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

export default function GruppeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState<string | null>(null)
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [members, setMembers] = useState<GroupMemberRow[]>([])
  const [checkins, setCheckins] = useState<GroupCheckinRow[]>([])
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    params.then((value) => setSlug(value.slug))
  }, [params])

  const group = slug ? getGroupBySlug(slug) : null

  useEffect(() => {
    if (!authResolved || !trainerRole || !group) return

    ;(async () => {
      try {
        setLoadError("")
        const response = await fetch(`/api/admin/group-detail?group=${encodeURIComponent(group)}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          if (response.status === 401) {
            clearTrainerAccess()
            throw new Error("Sitzung abgelaufen. Bitte neu anmelden.")
          }
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          members: GroupMemberRow[]
          checkins: GroupCheckinRow[]
        }

        setMembers(payload.members ?? [])
        setCheckins(payload.checkins ?? [])
      } catch (error) {
        console.error(error)
        setLoadError(error instanceof Error ? error.message : "Gruppendaten konnten nicht geladen werden.")
      }
    })()
  }, [authResolved, trainerRole, group])

  const today = new Date().toISOString().slice(0, 10)

  const plannedSessions = useMemo(() => {
    return group ? sessions.filter((session) => session.group === group) : []
  }, [group])

  const todayCheckins = useMemo(() => {
    return checkins.filter((row) => row.date === today)
  }, [checkins, today])

  if (slug && !group) {
    notFound()
  }

  if (!authResolved || !slug) {
    return <div className="text-sm text-zinc-500">Gruppendaten werden geladen...</div>
  }

  if (!trainerRole) {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Gruppe</CardTitle>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Gruppenunterseite
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">{group}</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung/gruppen">Zur Gruppenübersicht</Link>
        </Button>
      </div>

      {loadError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {loadError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Mitglieder</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{members.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Check-ins heute</div>
            <div className="mt-1 text-3xl font-bold text-emerald-700">{todayCheckins.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Wochentermine</div>
            <div className="mt-1 text-3xl font-bold">{plannedSessions.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Trainingszeiten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {plannedSessions.map((session) => (
            <div key={session.id} className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">{session.dayKey}</div>
              <div>{session.start} - {session.end}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitgliederliste</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Geburtsdatum</TableHead>
                {trainerRole === "admin" ? <TableHead>E-Mail</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={trainerRole === "admin" ? 4 : 3} className="text-center text-zinc-500">
                    Noch keine Mitglieder in dieser Gruppe.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{getMemberDisplayName(member)}</TableCell>
                    <TableCell>
                      {member.is_trial ? (
                        <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800">
                          Probemitglied
                        </Badge>
                      ) : member.is_approved ? (
                        <Badge variant="outline" className="border-green-200 bg-green-100 text-green-800">
                          Freigegeben
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-blue-200 bg-blue-100 text-blue-800">
                          Registriert
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{member.birthdate || "—"}</TableCell>
                    {trainerRole === "admin" ? <TableCell>{member.email || "—"}</TableCell> : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
