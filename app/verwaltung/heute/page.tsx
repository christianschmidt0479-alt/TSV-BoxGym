"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sessions } from "@/lib/boxgymSessions"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type CheckinRow = {
  id: string
  member_id: string
  group_name: string
  date: string
}

type MemberRow = {
  id: string
  base_group?: string | null
}

function getDayKey(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`)
  const day = date.getDay()

  switch (day) {
    case 1:
      return "Montag"
    case 2:
      return "Dienstag"
    case 3:
      return "Mittwoch"
    case 4:
      return "Donnerstag"
    case 5:
      return "Freitag"
    default:
      return ""
  }
}

export default function VerwaltungHeutePage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [todayCheckins, setTodayCheckins] = useState<CheckinRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    if (!authResolved || !trainerRole) {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/admin/today?today=${encodeURIComponent(today)}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          todayCheckins: CheckinRow[]
          members: MemberRow[]
        }

        setTodayCheckins(payload.todayCheckins ?? [])
        setMembers(payload.members ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, today, trainerRole])

  const todaysSessions = useMemo(() => {
    const dayKey = getDayKey(today)
    return sessions.filter((session) => session.dayKey === dayKey)
  }, [today])

  const summary = useMemo(() => {
    const activeGroupsToday = Array.from(new Set(todayCheckins.map((row) => row.group_name)))
    const boxzwergeTotal = members.filter((member) => member.base_group === "Boxzwerge").length
    const boxzwergePresent = todayCheckins.filter((row) => row.group_name === "Boxzwerge").length

    return {
      totalCheckins: todayCheckins.length,
      groupsActive: activeGroupsToday.length,
      sessionsPlanned: todaysSessions.length,
      boxzwergePresent,
      boxzwergeOpen: Math.max(0, boxzwergeTotal - boxzwergePresent),
    }
  }, [members, todayCheckins, todaysSessions.length])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (!trainerRole) {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Heute</CardTitle>
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Heute</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/verwaltung">Zurück zur Übersicht</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Check-ins heute</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : summary.totalCheckins}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Gruppen aktiv</div>
            <div className="mt-1 text-3xl font-bold">{loading ? "…" : summary.groupsActive}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Einheiten im Plan</div>
            <div className="mt-1 text-3xl font-bold">{loading ? "…" : summary.sessionsPlanned}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Boxzwerge da</div>
            <div className="mt-1 text-3xl font-bold text-emerald-700">{loading ? "…" : summary.boxzwergePresent}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Boxzwerge offen</div>
            <div className="mt-1 text-3xl font-bold text-amber-700">{loading ? "…" : summary.boxzwergeOpen}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Heutige Einheiten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todaysSessions.length === 0 ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Heute sind keine regulären Einheiten im Plan.</div>
            ) : (
              todaysSessions.map((session) => {
                const attendees = todayCheckins.filter((row) => row.group_name === session.group).length

                return (
                  <div key={session.id} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-semibold text-zinc-900">{session.group}</div>
                        <div className="mt-1 text-sm text-zinc-600">
                          {session.start} - {session.end}
                        </div>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-sm font-medium text-zinc-700">
                        Heute da: {attendees}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Schnellaktionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/verwaltung/checkins" className="block rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white">
              <div className="font-semibold text-zinc-900">Check-ins prüfen</div>
              <div className="mt-1 text-sm text-zinc-600">Tageslisten und Verlauf öffnen.</div>
            </Link>
            <Link href="/trainer/boxzwerge" className="block rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white">
              <div className="font-semibold text-zinc-900">Boxzwerge öffnen</div>
              <div className="mt-1 text-sm text-zinc-600">Anwesenheit und offene Kinder im Blick behalten.</div>
            </Link>
            <Link href="/verwaltung/gruppen" className="block rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white">
              <div className="font-semibold text-zinc-900">Gruppenansicht</div>
              <div className="mt-1 text-sm text-zinc-600">Direkt in die Gruppen- und Wochenansicht springen.</div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
