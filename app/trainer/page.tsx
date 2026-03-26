"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, ClipboardList, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { sessions } from "@/lib/boxgymSessions"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type CheckinRow = {
  id: string
  group_name: string
  date: string
  members?: {
    is_trial?: boolean
  } | null
}

type MemberRow = {
  id: string
  base_group?: string | null
  needs_trainer_assist_checkin?: boolean | null
}

type TrainerSectionAction = {
  href: string
  title: string
  description: string
}

type TrainerSection = {
  title: string
  description: string
  actions: TrainerSectionAction[]
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

export default function TrainerDashboardPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [todayCheckins, setTodayCheckins] = useState<CheckinRow[]>([])
  const [memberRows, setMemberRows] = useState<MemberRow[]>([])
  const [now, setNow] = useState<Date | null>(null)
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    if (!authResolved || !trainerRole) {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/trainer/overview?today=${encodeURIComponent(today)}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          todayCheckins: CheckinRow[]
          memberRows: MemberRow[]
        }

        setTodayCheckins(payload.todayCheckins ?? [])
        setMemberRows(payload.memberRows ?? [])
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

  const trainerAssistMembers = useMemo(() => {
    return memberRows.filter(
      (member) => member.base_group !== "Boxzwerge" && member.needs_trainer_assist_checkin
    ).length
  }, [memberRows])

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
      trialCount: rows.filter((row) => row.members?.is_trial).length,
    }
  }, [activeSession, todayCheckins])

  const previousSession = useMemo(() => {
    const currentNow = now ?? new Date(`${today}T12:00:00`)
    const nowMinutes = currentNow.getHours() * 60 + currentNow.getMinutes()

    const pastSessions = todaysSessions.filter((session) => {
      const [startHour, startMinute] = session.start.split(":").map(Number)
      const start = startHour * 60 + startMinute
      return start < nowMinutes
    })

    return pastSessions[pastSessions.length - 1] ?? null
  }, [now, today, todaysSessions])

  const previousSessionAttendees = useMemo(() => {
    if (!previousSession) return 0
    return todayCheckins.filter((row) => row.group_name === previousSession.group).length
  }, [previousSession, todayCheckins])

  const trainerSections = useMemo<TrainerSection[]>(() => {
    const sections: TrainerSection[] = [
      {
        title: "Heute",
        description: "Alles für den laufenden Trainingstag.",
        actions: [
          {
            href: "/trainer/heute",
            title: "Heute",
            description: "Kompakte Tagesansicht und Boxzwerge offen.",
          },
          {
            href: "/trainer/boxzwerge",
            title: "Boxzwerge",
            description: "Kinder aktivieren und Kontakte prüfen.",
          },
          {
            href: "/verwaltung/checkins",
            title: "Check-ins",
            description: "Listen und Verlauf schnell öffnen.",
          },
        ],
      },
      {
        title: "Sportler",
        description: "Mitglieder, Boxzwerge und Wettkampf.",
        actions: [
          {
            href: "/trainer/mitglieder",
            title: "Mitglieder suchen",
            description: "Letzte Aktivität und Anwesenheit ansehen.",
          },
          {
            href: "/trainer/wettkampf",
            title: "Wettkampf",
            description: "Aktive und inaktive Wettkämpfer sehen.",
          },
        ],
      },
    ]

    if (trainerRole === "admin") {
      sections.push({
        title: "Mehr",
        description: "Zusätzliche Wege für Admin im Trainermodus.",
        actions: [
          {
            href: "/verwaltung",
            title: "Adminbereich",
            description: "Inbox, Personen, Betrieb und System öffnen.",
          },
          {
            href: "/checkin/probetraining",
            title: "Probetraining",
            description: "Direkt ein neues Probetraining anmelden.",
          },
        ],
      })
    }

    return sections
  }, [trainerRole])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (!trainerRole) {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Trainer-Dashboard</CardTitle>
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
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            {trainerRole === "admin" ? "Admin mit Trainerzugriff" : "Trainerzugriff aktiv"}
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">Trainer-Dashboard</h1>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/">Zurück zum Check-in</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Einheiten heute</div>
            <div className="mt-1 text-3xl font-bold">{loading ? "…" : todaysSessions.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Aktuell im Kurs</div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">
              {loading ? "…" : activeSession ? activeSessionStats.attendees : "—"}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {activeSession
                ? `Kurs aktuell: ${activeSession.group} · ${activeSession.start} - ${activeSession.end}${activeSessionStats.trialCount > 0 ? ` · ${activeSessionStats.trialCount} Probetraining` : ""}`
                : "Gerade läuft kein Kurs"}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Vorheriger Kurs</div>
            <div className="mt-1 text-3xl font-bold text-emerald-700">
              {loading ? "…" : previousSession ? previousSessionAttendees : "—"}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {previousSession
                ? `${previousSession.group} · ${previousSession.start} - ${previousSession.end} · ${previousSessionAttendees} Sportler`
                : "Heute gab es noch keinen vorherigen Kurs"}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">Sonderoption markiert</div>
            <div className="mt-1 text-3xl font-bold text-blue-700">{loading ? "…" : trainerAssistMembers}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
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
                const isBoxzwerge = session.group === "Boxzwerge"

                return (
                  <div key={session.id} className="rounded-3xl border border-zinc-200 bg-white p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-lg font-semibold text-zinc-900">{session.group}</div>
                        <div className="mt-1 text-sm text-zinc-500">
                          {session.dayKey} · {session.start} - {session.end}
                        </div>
                      </div>
                      <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700">
                        Heute da: {attendees}
                      </div>
                    </div>
                    {isBoxzwerge ? (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button asChild className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
                          <Link href="/trainer/boxzwerge">
                            Boxzwerge einchecken
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}

            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <div className="flex items-center gap-2">
                <span>Kein regulärer Trainer-Check-in für normale Gruppen.</span>
                <InfoHint text="Für normale Trainingsgruppen gibt es hier keinen regulären Trainer-Check-in. Falls bei einzelnen Sportlern eine Ausnahme nötig ist, wird das in der Mitgliederverwaltung markiert." />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {trainerSections.map((section) => (
            <Card key={section.title} className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <span>{section.title === "Schnellzugriffe" ? "Direkte Wege für heute." : "Kompakter Überblick."}</span>
                  <InfoHint text={section.description} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {section.actions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-start justify-between gap-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-[#154c83] hover:bg-white"
                  >
                    <div>
                      <div className="font-semibold text-zinc-900">{action.title}</div>
                      <div className="mt-1 text-sm text-zinc-600">{action.description}</div>
                    </div>
                    {action.href === "/verwaltung/checkins" ? (
                      <ClipboardList className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                    ) : (
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                    )}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
