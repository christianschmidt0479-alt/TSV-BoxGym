"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { groupOptions, sessions, getGroupSlug } from "@/lib/boxgymSessions"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type MemberGroupRow = {
  id: string
  base_group?: string | null
  is_trial?: boolean
  is_approved?: boolean
}

type CheckinGroupRow = {
  id: string
  group_name: string
  date: string
}

export default function GruppenPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [memberRows, setMemberRows] = useState<MemberGroupRow[]>([])
  const [checkinRows, setCheckinRows] = useState<CheckinGroupRow[]>([])
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    if (!authResolved || !trainerRole) return

    ;(async () => {
      try {
        setLoadError("")
        const response = await fetch("/api/admin/groups", {
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
          memberRows: MemberGroupRow[]
          checkinRows: CheckinGroupRow[]
        }

        setMemberRows(payload.memberRows ?? [])
        setCheckinRows(payload.checkinRows ?? [])
      } catch (error) {
        console.error(error)
        setLoadError(error instanceof Error ? error.message : "Gruppen konnten nicht geladen werden.")
      }
    })()
  }, [authResolved, trainerRole])

  const today = new Date().toISOString().slice(0, 10)

  const groupCards = useMemo(() => {
    return groupOptions.map((group) => {
      const plannedSessions = sessions.filter((session) => session.group === group)
      const assignedMembers = memberRows.filter((member) => member.base_group === group)
      const todayCheckins = checkinRows.filter((row) => row.group_name === group && row.date === today)

      return {
        group,
        slug: getGroupSlug(group),
        plannedSessions,
        memberCount: assignedMembers.length,
        approvedCount: assignedMembers.filter((member) => member.is_approved).length,
        trialCount: assignedMembers.filter((member) => member.is_trial).length,
        todayCheckins: todayCheckins.length,
      }
    })
  }, [checkinRows, memberRows, today])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (!trainerRole) {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Gruppen</CardTitle>
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Gruppen</h1>
      </div>

      {loadError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {loadError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groupCards.map((group) => (
          <Card key={group.group} className="rounded-[28px] border border-zinc-200 shadow-sm">
            <CardHeader className="space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                <Users className="h-3.5 w-3.5" />
                TSV Falkensee
              </div>
              <CardTitle className="text-xl">{group.group}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-zinc-100 p-3">
                  <div className="text-xs text-zinc-500">Mitglieder</div>
                  <div className="mt-1 text-2xl font-bold text-[#154c83]">{group.memberCount}</div>
                </div>
                <div className="rounded-2xl bg-zinc-100 p-3">
                  <div className="text-xs text-zinc-500">Check-ins heute</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-700">{group.todayCheckins}</div>
                </div>
              </div>

              <div className="space-y-1 text-sm text-zinc-600">
                <div>Freigegeben: {group.approvedCount}</div>
                <div>Probemitglieder: {group.trialCount}</div>
                <div>Termine im Wochenplan: {group.plannedSessions.length}</div>
              </div>

              <Button asChild className="w-full rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
                <Link href={`/verwaltung/gruppen/${group.slug}`}>
                  Gruppe öffnen
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
