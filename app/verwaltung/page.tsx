"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BarChart3, Clock3, ShieldCheck, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { groupOptions, sessions } from "@/lib/boxgymSessions"
import { formatDisplayDateTime, formatIsoDateForDisplay, getTodayIsoDateInBerlin } from "@/lib/dateFormat"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type MemberOverviewRow = {
  id: string
  first_name?: string
  last_name?: string
  name?: string
  birthdate?: string
  base_group?: string | null
  is_trial?: boolean
  is_approved?: boolean
}

type CheckinOverviewRow = {
  id: string
  group_name: string
  date: string
}

type AdminDigestQueueRow = {
  id: string
  kind: "member" | "trainer" | "boxzwerge"
  member_name: string
  created_at: string
  sent_at: string | null
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

function getMemberDisplayName(member?: Partial<MemberOverviewRow> | null) {
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

export default function VerwaltungOverviewPage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [memberRows, setMemberRows] = useState<MemberOverviewRow[]>([])
  const [todayCheckins, setTodayCheckins] = useState<CheckinOverviewRow[]>([])
  const [digestQueueRows, setDigestQueueRows] = useState<AdminDigestQueueRow[]>([])

  const today = useMemo(() => getTodayIsoDateInBerlin(), [])

  useEffect(() => {
    if (!authResolved || !trainerRole) {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/admin/overview?today=${encodeURIComponent(today)}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          memberRows: MemberOverviewRow[]
          todayCheckins: CheckinOverviewRow[]
          digestQueueRows: AdminDigestQueueRow[]
        }

        setMemberRows(payload.memberRows ?? [])
        setTodayCheckins(payload.todayCheckins ?? [])
        setDigestQueueRows(payload.digestQueueRows ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, today, trainerRole])

  const summary = useMemo(() => {
    const pendingApprovals = memberRows.filter((member) => !member.is_trial && !member.is_approved).length
    const approvedMembers = memberRows.filter((member) => member.is_approved).length
    const trialMembers = memberRows.filter((member) => member.is_trial).length
    const activeGroupsToday = new Set(todayCheckins.map((row) => row.group_name)).size
    const todaySessions = sessions.filter((session) => session.dayKey === getDayKey(today))

    return {
      totalMembers: memberRows.length,
      approvedMembers,
      trialMembers,
      pendingApprovals,
      todayCheckins: todayCheckins.length,
      activeGroupsToday,
      todaySessions: todaySessions.length,
    }
  }, [memberRows, today, todayCheckins])

  const boxzwergeAgingWarnings = useMemo(() => {
    return memberRows
      .filter((member) => member.base_group === "Boxzwerge")
      .map((member) => ({
        ...member,
        age: getAgeInYears(member.birthdate),
      }))
      .filter((member) => (member.age ?? -1) >= 10)
      .sort((a, b) => (b.age ?? 0) - (a.age ?? 0))
  }, [memberRows])

  const digestSummary = useMemo(() => {
    return {
      total: digestQueueRows.length,
      members: digestQueueRows.filter((row) => row.kind === "member").length,
      trainers: digestQueueRows.filter((row) => row.kind === "trainer").length,
      boxzwerge: digestQueueRows.filter((row) => row.kind === "boxzwerge").length,
      latest: digestQueueRows[0] ?? null,
    }
  }, [digestQueueRows])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (!trainerRole) {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Verwaltung</CardTitle>
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
    <div className="space-y-5">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        <ShieldCheck className="h-3 w-3" />
        {trainerRole === "admin" ? "Adminzugang" : "Trainerzugang"}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Users className="h-4 w-4" />
              Mitglieder
            </div>
            <div className="mt-1 text-3xl font-bold text-zinc-900">{loading ? "…" : summary.totalMembers}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <BarChart3 className="h-4 w-4" />
              Check-ins heute
            </div>
            <div className="mt-1 text-3xl font-bold text-[#154c83]">{loading ? "…" : summary.todayCheckins}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Clock3 className="h-4 w-4" />
              Trainings heute
            </div>
            <div className="mt-1 text-3xl font-bold text-zinc-900">{loading ? "…" : summary.todaySessions}</div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-zinc-500">
              {trainerRole === "admin" ? "Offene Freigaben" : "Aktive Gruppen heute"}
            </div>
            <div className="mt-1 text-3xl font-bold text-emerald-700">
              {loading ? "…" : trainerRole === "admin" ? summary.pendingApprovals : summary.activeGroupsToday}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Stand heute</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-600">
          {boxzwergeAgingWarnings.length > 0 ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
              <div className="font-semibold">Warnung für Christian Schmidt</div>
              <div className="mt-1">
                {boxzwergeAgingWarnings.length} Boxzwerge sind 10 Jahre oder älter und sollten geprüft werden.
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {boxzwergeAgingWarnings.map((member) => (
                  <div key={member.id}>
                    {getMemberDisplayName(member)} · {formatIsoDateForDisplay(member.birthdate) || "Geburtsdatum offen"} · {member.age} Jahre
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button asChild variant="outline" className="rounded-2xl border-red-200 bg-white text-red-900 hover:bg-red-100">
                  <Link href="/verwaltung/mitglieder?gruppe=Boxzwerge">Zur Mitgliederverwaltung</Link>
                </Button>
              </div>
            </div>
          ) : null}
          {trainerRole === "admin" ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
              <div className="font-semibold">Admin-Sammelmail</div>
              <div className="mt-1 flex items-center gap-2 text-sm text-blue-900">
                <span><span className="font-semibold">{loading ? "…" : digestSummary.total}</span> offen.</span>
                <InfoHint text={`Versand werktags um 09:00 Uhr. Aktuell warten ${loading ? "…" : digestSummary.total} Vorgänge auf die nächste Sammelmail.`} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-2xl bg-white/80 p-3">Boxbereich: <span className="font-semibold">{loading ? "…" : digestSummary.members}</span></div>
                <div className="rounded-2xl bg-white/80 p-3">Trainer: <span className="font-semibold">{loading ? "…" : digestSummary.trainers}</span></div>
                <div className="rounded-2xl bg-white/80 p-3">Boxzwerge: <span className="font-semibold">{loading ? "…" : digestSummary.boxzwerge}</span></div>
              </div>
              {digestSummary.latest ? (
                <div className="mt-3 text-xs text-blue-800">
                  Letzter Eingang: {digestSummary.latest.member_name} ·{" "}
                  {formatDisplayDateTime(new Date(digestSummary.latest.created_at))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-blue-800">Zurzeit liegt kein offener Vorgang in der Sammelmail-Warteschlange.</div>
              )}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-zinc-100 px-3 py-2.5">
              <div className="text-xs text-zinc-500">Freigegeben</div>
              <div className="mt-0.5 text-xl font-bold text-zinc-900">{loading ? "…" : summary.approvedMembers}</div>
            </div>
            <div className="rounded-xl bg-zinc-100 px-3 py-2.5">
              <div className="text-xs text-zinc-500">Probe</div>
              <div className="mt-0.5 text-xl font-bold text-zinc-900">{loading ? "…" : summary.trialMembers}</div>
            </div>
            <div className="rounded-xl bg-zinc-100 px-3 py-2.5">
              <div className="text-xs text-zinc-500">Gruppen Wochenplan</div>
              <div className="mt-0.5 text-xl font-bold text-zinc-900">{groupOptions.length}</div>
            </div>
            <div className="rounded-xl bg-zinc-100 px-3 py-2.5">
              <div className="text-xs text-zinc-500">Gruppen aktiv heute</div>
              <div className="mt-0.5 text-xl font-bold text-zinc-900">{loading ? "…" : summary.activeGroupsToday}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
