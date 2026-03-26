"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, ClipboardList, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GroupFilterBar } from "@/components/group-filter-bar"
import { InfoHint } from "@/components/ui/info-hint"
import { groupOptions, sessions } from "@/lib/boxgymSessions"
import { clearTrainerAccessSession } from "@/lib/trainerAccess"
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

type ActionLink = {
  href: string
  title: string
  description: string
  adminOnly?: boolean
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

function countByGroup<T extends { group: string }>(rows: T[]) {
  const counts = new Map<string, number>()

  for (const row of rows) {
    counts.set(row.group, (counts.get(row.group) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => a.group.localeCompare(b.group))
}

function TrainerStat({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <Card className="h-full rounded-[24px] border-0 shadow-sm">
      <CardContent className="flex h-full flex-col justify-between p-5">
        <div className="text-sm text-zinc-500">{label}</div>
        <div className="mt-2 text-3xl font-bold text-zinc-900">{value}</div>
        {hint ? <div className="mt-2 text-xs leading-5 text-zinc-500">{hint}</div> : <div className="mt-2 text-xs text-transparent">.</div>}
      </CardContent>
    </Card>
  )
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode
  tone?: "default" | "blue" | "amber" | "emerald"
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "emerald"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-zinc-200 bg-zinc-100 text-zinc-700"

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  )
}

function ActionListCard({
  title,
  description,
  actions,
  muted = false,
}: {
  title: string
  description: string
  actions: ActionLink[]
  muted?: boolean
}) {
  if (actions.length === 0) return null

  return (
    <Card className={`rounded-[24px] border-0 shadow-sm ${muted ? "bg-zinc-50" : ""}`}>
      <CardHeader className="space-y-2">
        <CardTitle>{title}</CardTitle>
        <p className="text-sm leading-6 text-zinc-500">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`flex items-start justify-between gap-4 rounded-3xl border p-4 transition hover:border-[#154c83] hover:bg-zinc-50 ${
              muted ? "border-zinc-200 bg-zinc-100" : "border-zinc-200 bg-white"
            }`}
          >
            <div>
              <div className="font-semibold text-zinc-900">{action.title}</div>
              <div className="mt-1 text-sm leading-6 text-zinc-600">{action.description}</div>
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
  )
}

export default function TrainerDashboardPage() {
  const router = useRouter()
  const {
    resolved: authResolved,
    role: trainerRole,
    accountRole,
    accountEmail,
    accountFirstName,
    accountLastName,
  } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [todayCheckins, setTodayCheckins] = useState<CheckinRow[]>([])
  const [memberRows, setMemberRows] = useState<MemberRow[]>([])
  const [now, setNow] = useState<Date | null>(null)
  const [selectedGroup, setSelectedGroup] = useState("alle")
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const sessionLabel = useMemo(() => {
    const fullName = `${accountFirstName} ${accountLastName}`.trim()
    const roleLabel = accountRole === "admin" ? "Admin" : "Trainer"
    if (fullName) return `${fullName} · ${roleLabel}`
    if (accountEmail) return `${accountEmail} · ${roleLabel}`
    return roleLabel
  }, [accountEmail, accountFirstName, accountLastName, accountRole])

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

  const previousSession = useMemo(() => {
    const currentNow = now ?? new Date(`${today}T12:00:00`)
    const nowMinutes = currentNow.getHours() * 60 + currentNow.getMinutes()

    const pastSessions = todaysSessions.filter((session) => {
      const [startHour, startMinute] = session.start.split(":").map(Number)
      return startHour * 60 + startMinute < nowMinutes
    })

    return pastSessions[pastSessions.length - 1] ?? null
  }, [now, today, todaysSessions])

  const filteredSessions = useMemo(() => {
    if (selectedGroup === "alle") return todaysSessions
    return todaysSessions.filter((session) => session.group === selectedGroup)
  }, [selectedGroup, todaysSessions])

  const filteredTodayCheckins = useMemo(() => {
    if (selectedGroup === "alle") return todayCheckins
    return todayCheckins.filter((row) => row.group_name === selectedGroup)
  }, [selectedGroup, todayCheckins])

  const filteredMemberRows = useMemo(() => {
    if (selectedGroup === "alle") return memberRows
    return memberRows.filter((member) => member.base_group === selectedGroup)
  }, [memberRows, selectedGroup])

  const filteredActiveSession = useMemo(() => {
    if (selectedGroup === "alle") return activeSession
    return activeSession?.group === selectedGroup ? activeSession : null
  }, [activeSession, selectedGroup])

  const filteredPreviousSession = useMemo(() => {
    if (selectedGroup === "alle") return previousSession
    return previousSession?.group === selectedGroup ? previousSession : null
  }, [previousSession, selectedGroup])

  const trialCount = useMemo(() => {
    return filteredTodayCheckins.filter((row) => row.members?.is_trial).length
  }, [filteredTodayCheckins])

  const activeSessionCount = useMemo(() => {
    if (!filteredActiveSession) return 0
    return filteredTodayCheckins.filter((row) => row.group_name === filteredActiveSession.group).length
  }, [filteredActiveSession, filteredTodayCheckins])

  const previousSessionCount = useMemo(() => {
    if (!filteredPreviousSession) return 0
    return filteredTodayCheckins.filter((row) => row.group_name === filteredPreviousSession.group).length
  }, [filteredPreviousSession, filteredTodayCheckins])

  const trainerAssistMembers = useMemo(() => {
    return filteredMemberRows.filter(
      (member) => member.base_group !== "Boxzwerge" && member.needs_trainer_assist_checkin
    ).length
  }, [filteredMemberRows])

  const checkinSummary = useMemo(() => {
    const grouped = new Map<string, { count: number; trial: number }>()

    for (const row of filteredTodayCheckins) {
      const current = grouped.get(row.group_name) ?? { count: 0, trial: 0 }
      current.count += 1
      if (row.members?.is_trial) current.trial += 1
      grouped.set(row.group_name, current)
    }

    return Array.from(grouped.entries())
      .map(([group, values]) => ({
        group,
        count: values.count,
        trial: values.trial,
        members: values.count - values.trial,
      }))
      .sort((a, b) => a.group.localeCompare(b.group))
  }, [filteredTodayCheckins])

  const assistSummary = useMemo(() => {
    const grouped = countByGroup(
      filteredMemberRows
        .filter((member) => member.base_group && member.needs_trainer_assist_checkin)
        .map((member) => ({ group: member.base_group as string }))
    )

    return grouped
  }, [filteredMemberRows])

  const trainerActions = useMemo<ActionLink[]>(() => {
    return [
      {
        href: "/trainer/heute",
        title: "Heute",
        description: "Schneller Überblick für den laufenden Trainingstag.",
      },
      {
        href: "/trainer/mitglieder",
        title: "Mitglieder",
        description: "Mitglieder suchen und letzte Aktivität ansehen.",
      },
      {
        href: "/trainer/wettkampf",
        title: "Wettkampf",
        description: "Aktive und inaktive Wettkämpfer aufrufen.",
      },
      {
        href: "/trainer/boxzwerge",
        title: "Boxzwerge",
        description: "Kinder einchecken und Kontakte prüfen.",
      },
    ]
  }, [])

  const adminActions = useMemo<ActionLink[]>(() => {
    if (trainerRole !== "admin") return []

    return [
      {
        href: "/verwaltung",
        title: "Adminbereich",
        description: "Betrieb, Personen, Inbox und Einstellungen öffnen.",
        adminOnly: true,
      },
      {
        href: "/verwaltung/checkins",
        title: "Check-ins verwalten",
        description: "Listen, Verlauf und Tagesansicht öffnen.",
        adminOnly: true,
      },
      {
        href: "/checkin/probetraining",
        title: "Probetraining starten",
        description: "Direkt ein neues Probetraining anmelden.",
        adminOnly: true,
      },
    ]
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
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Nur mit Trainer- oder Adminzugang.
          </div>
          <Button asChild className="rounded-2xl">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  async function handleLogout() {
    await clearTrainerAccessSession()
    router.replace("/trainer-zugang")
    router.refresh()
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            {trainerRole === "admin" ? "Admin mit Trainerzugriff" : "Trainerzugriff aktiv"}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Trainerbereich</h1>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              Tagesüberblick, laufender Betrieb und getrennte Aktionen.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 shadow-sm">
            <span>Angemeldet als</span>
            <span className="font-semibold text-zinc-900">{sessionLabel}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="rounded-2xl" onClick={() => void handleLogout()}>
            Abmelden
          </Button>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900">Tagesübersicht</h2>
          <p className="text-sm text-zinc-500">Die wichtigsten Werte für heute, kompakt und direkt lesbar.</p>
        </div>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <GroupFilterBar
              options={groupOptions}
              value={selectedGroup}
              onChange={setSelectedGroup}
              description="Gruppe zuerst wählen, damit Übersicht und Listen direkt auf den relevanten Bereich fokussiert bleiben."
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TrainerStat
            label="Check-ins heute"
            value={loading ? "…" : filteredTodayCheckins.length}
            hint={selectedGroup === "alle" ? "Alle Gruppen" : selectedGroup}
          />
          <TrainerStat
            label="Aktive Einheit"
            value={loading ? "…" : filteredActiveSession ? activeSessionCount : "—"}
            hint={
              filteredActiveSession
                ? `${filteredActiveSession.group} · ${filteredActiveSession.start} - ${filteredActiveSession.end}`
                : "Keine passende Einheit"
            }
          />
          <TrainerStat
            label="Probetraining"
            value={loading ? "…" : trialCount}
            hint="Heute sichtbar"
          />
          <TrainerStat
            label="Sonderoption"
            value={loading ? "…" : trainerAssistMembers}
            hint="Offene Hinweise"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900">Laufender Betrieb</h2>
          <p className="text-sm text-zinc-500">Heutige Check-ins und offene Punkte als ruhige Kartenansicht.</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Heutige Check-ins</CardTitle>
                <Badge tone="blue">{selectedGroup === "alle" ? "Alle Gruppen" : selectedGroup}</Badge>
                {filteredPreviousSession ? <Badge>{`Vorherige Einheit ${previousSessionCount}`}</Badge> : null}
              </div>
              <div className="text-sm text-zinc-500">
                Gruppenübersicht für heute, kompakt und ohne Tabellenansicht.
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {checkinSummary.length === 0 ? (
                <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
                  Für diese Auswahl gibt es heute noch keine Check-ins.
                </div>
              ) : (
                checkinSummary.map((entry) => (
                  <div key={entry.group} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-2">
                        <div className="font-semibold text-zinc-900">{entry.group}</div>
                        <div className="flex flex-wrap gap-2">
                          <Badge>{`${entry.count} gesamt`}</Badge>
                          <Badge tone="emerald">{`${entry.members} Mitglieder`}</Badge>
                          <Badge tone="amber">{`${entry.trial} Probetraining`}</Badge>
                        </div>
                      </div>
                      {filteredActiveSession?.group === entry.group ? (
                        <Badge tone="blue">Läuft gerade</Badge>
                      ) : filteredPreviousSession?.group === entry.group ? (
                        <Badge>Vorherige Einheit</Badge>
                      ) : null}
                    </div>
                  </div>
                ))
              )}

              <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <div className="flex items-center gap-2">
                  <span>Normale Gruppen laufen ohne eigenen Trainer-Check-in.</span>
                  <InfoHint text="Für normale Trainingsgruppen gibt es hier keinen regulären Trainer-Check-in. Falls bei einzelnen Sportlern eine Ausnahme nötig ist, wird das in der Mitgliederverwaltung markiert." />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Mitgliederhinweise</CardTitle>
                  <Badge tone="blue">{loading ? "…" : `${filteredMemberRows.length} sichtbar`}</Badge>
                </div>
                <div className="text-sm text-zinc-500">
                  Hinweise und offene Punkte in der gewählten Gruppe.
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {assistSummary.length === 0 ? (
                  <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
                    Aktuell keine markierten Mitglieder mit Sonderoption.
                  </div>
                ) : (
                  assistSummary.map((entry) => (
                    <div key={entry.group} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="space-y-1">
                        <div className="font-medium text-zinc-900">{entry.group}</div>
                        <div className="text-sm text-zinc-500">Mitglieder mit Hinweis</div>
                      </div>
                      <Badge tone="amber">{entry.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Heute im Plan</CardTitle>
                  <Badge>{loading ? "…" : `${filteredSessions.length} Einheiten`}</Badge>
                </div>
                <div className="text-sm text-zinc-500">
                  Nur die Einheiten, die für heute wirklich relevant sind.
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredSessions.length === 0 ? (
                  <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
                    Heute sind für diese Auswahl keine regulären Einheiten im Wochenplan.
                  </div>
                ) : (
                  filteredSessions.map((session) => (
                    <div key={session.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                        <div className="font-semibold text-zinc-900">{session.group}</div>
                        <div className="text-sm text-zinc-500">
                          {session.dayKey} · {session.start} - {session.end}
                        </div>
                      </div>
                        {filteredActiveSession?.id === session.id ? (
                          <Badge tone="blue">Aktiv</Badge>
                        ) : filteredPreviousSession?.id === session.id ? (
                          <Badge>Vorherige</Badge>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900">Aktionen</h2>
          <p className="text-sm text-zinc-500">Standardwege zuerst, Admin getrennt und bewusst zurückhaltender.</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ActionListCard
            title="Trainer"
            description="Schnellzugriffe für den normalen Ablauf im Gym."
            actions={trainerActions}
          />

          {trainerRole === "admin" ? (
            <ActionListCard
              title="Admin"
              description="Zusätzliche Verwaltungswege nur für Admin im Trainermodus."
              actions={adminActions}
              muted
            />
          ) : (
            <Card className="rounded-[24px] border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Admin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
                  Keine Admin-Aktionen sichtbar. Dieser Bereich bleibt im Trainerzugang bewusst reduziert.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  )
}
