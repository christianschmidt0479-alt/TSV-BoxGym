"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { sessions } from "@/lib/boxgymSessions"
import { getTodayIsoDateInBerlin } from "@/lib/dateFormat"
import { getMemberCheckinModeLabel } from "@/lib/memberCheckin"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type CheckinMember = {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  is_trial?: boolean
}

type CheckinRow = {
  id: string
  group_name: string
  checkin_mode?: string | null
  date: string
  time?: string
  created_at?: string
  members?: CheckinMember | CheckinMember[] | null
}

function getRelatedMember(member?: CheckinRow["members"]) {
  if (Array.isArray(member)) return member[0] ?? null
  return member ?? null
}

function getMemberDisplayName(member?: CheckinRow["members"]) {
  const resolvedMember = getRelatedMember(member)
  const first = resolvedMember?.first_name ?? ""
  const last = resolvedMember?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || resolvedMember?.name || "—"
}

function getCheckinModeBadgeClassName(mode?: string | null) {
  return mode === "ferien"
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-[#cfe0ef] bg-[#f4f9ff] text-[#154c83]"
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

export default function TrainerHeutePage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [todayCheckins, setTodayCheckins] = useState<CheckinRow[]>([])
  const [now, setNow] = useState<Date | null>(null)
  const today = useMemo(() => getTodayIsoDateInBerlin(), [])

  useEffect(() => {
    if (!authResolved || !trainerRole) {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/trainer/today?today=${encodeURIComponent(today)}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          todayCheckins: CheckinRow[]
        }

        setTodayCheckins(payload.todayCheckins ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, today, trainerRole])

  useEffect(() => {
    const updateNow = () => setNow(new Date())
    updateNow()
    const interval = window.setInterval(updateNow, 60000)
    return () => window.clearInterval(interval)
  }, [])

  const todaysSessions = useMemo(() => {
    const dayKey = getDayKey(today)
    return sessions.filter((session) => session.dayKey === dayKey)
  }, [today])

  const summary = useMemo(() => {
    return {
      sessions: todaysSessions.length,
    }
  }, [todaysSessions.length])

  const activeSession = useMemo(() => {
    const currentNow = now ?? new Date(`${today}T12:00:00`)
    const nowMinutes = currentNow.getHours() * 60 + currentNow.getMinutes()

    return (
      todaysSessions.find((session) => {
        const [startHour, startMinute] = session.start.split(":").map(Number)
        const [endHour, endMinute] = session.end.split(":").map(Number)
        const start = startHour * 60 + startMinute
        const end = endHour * 60 + endMinute

        return nowMinutes >= start && nowMinutes < end
      }) ?? null
    )
  }, [now, today, todaysSessions])

  const activeSessionStats = useMemo(() => {
    if (!activeSession) {
      return {
        attendees: 0,
        trialCount: 0,
      }
    }

    const rows = todayCheckins.filter((row) => row.group_name === activeSession.group)
    return {
      attendees: rows.length,
      trialCount: rows.filter((row) => getRelatedMember(row.members)?.is_trial).length,
    }
  }, [activeSession, todayCheckins])

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
          <Link href="/trainer">Zurück zur Übersicht</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Jetziger Kurs</div>
            <div className="mt-1 text-2xl font-bold text-[#154c83]">
              {loading ? "…" : activeSession ? activeSession.group : "—"}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {activeSession
                ? `${activeSession.start} - ${activeSession.end} · ${activeSessionStats.attendees} Sportler`
                : "Gerade läuft kein Kurs"}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Probetraining aktueller Kurs</div>
            <div className="mt-1 text-3xl font-bold text-emerald-700">
              {loading ? "…" : activeSession ? activeSessionStats.trialCount : "—"}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {activeSession ? `${activeSession.group} aktuell` : "Gerade läuft kein Kurs"}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Trainings heute insgesamt</div>
            <div className="mt-1 text-3xl font-bold text-amber-700">{loading ? "…" : summary.sessions}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Heute im Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todaysSessions.length === 0 ? (
              <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Heute sind keine regulären Einheiten im Wochenplan.</div>
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
            <Link href="/trainer/boxzwerge" className="block rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white">
              <div className="font-semibold text-zinc-900">Boxzwerge öffnen</div>
              <div className="mt-1 text-sm text-zinc-600">Kinder aktivieren und offene Fälle prüfen.</div>
            </Link>
            <Link href="/trainer/mitglieder" className="block rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white">
              <div className="font-semibold text-zinc-900">Mitglieder suchen</div>
              <div className="mt-1 text-sm text-zinc-600">Anwesenheit einzelner Sportler ansehen.</div>
            </Link>
            <Link href="/verwaltung/checkins" className="block rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white">
              <div className="font-semibold text-zinc-900">Check-ins öffnen</div>
              <div className="mt-1 text-sm text-zinc-600">Tageslisten und Verlauf im Verwaltungsbereich.</div>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Check-ins heute</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">Check-ins werden geladen...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeitpunkt</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Gruppe</TableHead>
                  <TableHead>Modus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todayCheckins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-zinc-500">
                      Heute liegen noch keine Check-ins vor.
                    </TableCell>
                  </TableRow>
                ) : (
                  todayCheckins.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.date} · {row.time ?? "—"}</TableCell>
                      <TableCell className="font-medium">{getMemberDisplayName(row.members)}</TableCell>
                      <TableCell>{row.group_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getCheckinModeBadgeClassName(row.checkin_mode)}>
                          {getMemberCheckinModeLabel(row.checkin_mode)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
