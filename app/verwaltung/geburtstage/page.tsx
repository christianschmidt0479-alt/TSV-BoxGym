"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CalendarDays, Gift, RefreshCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { formatIsoDateForDisplay } from "@/lib/dateFormat"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

type BirthdayEntry = {
  id: string
  display_name: string
  birthdate: string
  base_group: string | null
  is_trial: boolean
  is_approved: boolean
  occurrence_date: string
  turning_age: number
  is_today: boolean
  days_from_today: number
}

function getRelativeLabel(daysFromToday: number) {
  if (daysFromToday === 0) return "Heute"
  if (daysFromToday === 1) return "Morgen"
  if (daysFromToday === -1) return "Gestern"
  if (daysFromToday > 1) return `In ${daysFromToday} Tagen`
  return `Vor ${Math.abs(daysFromToday)} Tagen`
}

function getAgeLabel(entry: BirthdayEntry) {
  if (entry.days_from_today === 0) return `Wird heute ${entry.turning_age}`
  if (entry.days_from_today > 0) return `Wird ${entry.turning_age}`
  return `Wurde ${entry.turning_age}`
}

function BirthdayList({
  title,
  description,
  entries,
  emptyText,
}: {
  title: string
  description: string
  entries: BirthdayEntry[]
  emptyText: string
}) {
  return (
    <Card className="rounded-[24px] border-0 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{title}</CardTitle>
          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
            {entries.length}
          </span>
        </div>
        <div className="text-sm text-zinc-500">{description}</div>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 ? (
          <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">{emptyText}</div>
        ) : (
          entries.map((entry) => (
            <div key={`${entry.id}-${entry.occurrence_date}`} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <div className="font-semibold text-zinc-900">{entry.display_name}</div>
                  <div className="text-sm text-zinc-500">
                    {formatIsoDateForDisplay(entry.birthdate) || "Geburtsdatum offen"}
                    {entry.base_group ? ` · ${entry.base_group}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${entry.is_today ? "border-amber-200 bg-amber-50 text-amber-800" : "border-zinc-200 bg-white text-zinc-700"}`}>
                    {getRelativeLabel(entry.days_from_today)}
                  </span>
                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    {getAgeLabel(entry)}
                  </span>
                  {entry.is_trial ? (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      Probemitglied
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 text-sm text-zinc-600">
                Termin: {formatIsoDateForDisplay(entry.occurrence_date) || entry.occurrence_date}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export default function GeburtstagePage() {
  const { resolved: authResolved, role: trainerRole } = useTrainerAccess()
  const [loading, setLoading] = useState(true)
  const [todayBirthdays, setTodayBirthdays] = useState<BirthdayEntry[]>([])
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<BirthdayEntry[]>([])
  const [recentBirthdays, setRecentBirthdays] = useState<BirthdayEntry[]>([])

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    if (!authResolved || trainerRole !== "admin") {
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/admin/birthdays?today=${encodeURIComponent(today)}`, {
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error(await response.text())
        }

        const payload = (await response.json()) as {
          todayBirthdays: BirthdayEntry[]
          upcomingBirthdays: BirthdayEntry[]
          recentBirthdays: BirthdayEntry[]
        }

        setTodayBirthdays(payload.todayBirthdays ?? [])
        setUpcomingBirthdays(payload.upcomingBirthdays ?? [])
        setRecentBirthdays(payload.recentBirthdays ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, today, trainerRole])

  if (!authResolved) {
    return <div className="text-sm text-zinc-500">Zugriff wird geprüft...</div>
  }

  if (trainerRole !== "admin") {
    return (
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Geburtstage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Nur mit Adminzugang sichtbar.
          </div>
          <Button asChild className="rounded-2xl">
            <Link href="/verwaltung">Zur Verwaltungsübersicht</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700">
            <Gift className="h-3.5 w-3.5" />
            Adminfunktion
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Geburtstage</h1>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              Nächste und zuletzt vergangene Geburtstage auf einen Blick.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 shadow-sm">
          <CalendarDays className="h-3.5 w-3.5" />
          Stand {formatIsoDateForDisplay(today) || today}
        </div>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <span className="font-semibold text-zinc-900">Geburtstagsübersicht</span>
              <InfoHint text="Die Liste zeigt die nächsten 5 kommenden Geburtstage inklusive heute sowie die letzten 5 bereits vergangenen Geburtstage. Im Trainer-Dashboard erscheinen Hinweise erst nach einem erfolgreichen Check-in am Geburtstag." />
            </div>
            <div className="text-sm text-zinc-500">
              {loading ? "Lade Geburtstage..." : `${todayBirthdays.length} heute, ${upcomingBirthdays.length} kommend, ${recentBirthdays.length} zuletzt.`}
            </div>
          </div>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/verwaltung/mitglieder">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Mitglieder öffnen
            </Link>
          </Button>
        </CardContent>
      </Card>

      {todayBirthdays.length > 0 ? (
        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Heute Geburtstag</CardTitle>
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                {todayBirthdays.length}
              </span>
            </div>
            <div className="text-sm text-zinc-500">Diese Mitglieder haben heute Geburtstag und sollten im Tagesbetrieb sichtbar bleiben.</div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {todayBirthdays.map((entry) => (
              <div key={entry.id} className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                <div className="font-semibold">{entry.display_name}</div>
                <div className="mt-1 text-sm text-amber-900">
                  {entry.base_group || "Keine Stammgruppe"} · {formatIsoDateForDisplay(entry.birthdate) || "Geburtsdatum offen"}
                </div>
                <div className="mt-3 inline-flex rounded-full border border-white/70 bg-white px-2.5 py-1 text-xs font-medium text-amber-800">
                  Wird heute {entry.turning_age}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <BirthdayList
          title="Nächste 5 Geburtstage"
          description="Kommende Geburtstage inklusive heute, damit Vorbereitung und Ansprache frühzeitig möglich bleiben."
          entries={upcomingBirthdays}
          emptyText="Aktuell konnten keine kommenden Geburtstage ermittelt werden."
        />
        <BirthdayList
          title="Letzte 5 Geburtstage"
          description="Zuletzt vergangene Geburtstage für Rückblick und Nachverfolgung."
          entries={recentBirthdays}
          emptyText="Aktuell konnten keine vergangenen Geburtstage ermittelt werden."
        />
      </div>
    </div>
  )
}