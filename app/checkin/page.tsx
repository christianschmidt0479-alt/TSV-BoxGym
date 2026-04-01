"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Clock3, UserPlus, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sessions } from "@/lib/boxgymSessions"

function dateLabel(date: Date) {
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function timeLabel(date: Date) {
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function parseTimeToDate(time: string, referenceDate: Date) {
  const [hours, minutes] = time.split(":").map(Number)
  const parsed = new Date(referenceDate)
  parsed.setHours(hours, minutes, 0, 0)
  return parsed
}

function getRelevantSession(referenceDate: Date, dailySessions: (typeof sessions)[number][]) {
  const sessionWithTimes = dailySessions
    .map((session) => {
      const startDate = parseTimeToDate(session.start, referenceDate)
      return {
        session,
        windowStart: new Date(startDate.getTime() - 30 * 60 * 1000),
        windowEnd: new Date(startDate.getTime() + 30 * 60 * 1000),
      }
    })
    .sort((left, right) => left.windowStart.getTime() - right.windowStart.getTime())

  return (
    sessionWithTimes.find(({ windowStart, windowEnd }) => referenceDate.getTime() >= windowStart.getTime() && referenceDate.getTime() <= windowEnd.getTime()) ??
    sessionWithTimes.find(({ windowStart }) => windowStart.getTime() > referenceDate.getTime()) ??
    null
  )
}

function checkinWindowLabel(referenceDate: Date, dailySessions: (typeof sessions)[number][]) {
  const relevantSession = getRelevantSession(referenceDate, dailySessions)
  if (!relevantSession) return "Heute keine passende Einheit"

  return `${timeLabel(relevantSession.windowStart)} - ${timeLabel(relevantSession.windowEnd)}`
}

function getDayKey(date: Date) {
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

export default function CheckinLandingPage() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const sync = () => setNow(new Date())
    sync()
    const interval = window.setInterval(sync, 1000)
    return () => window.clearInterval(interval)
  }, [])

  const currentDate = now ?? new Date()
  const displayDate = dateLabel(currentDate)
  const displayTime = timeLabel(currentDate)
  const todaysSessions = useMemo(() => {
    const dayKey = getDayKey(currentDate)
    return sessions.filter((session) => session.dayKey === dayKey)
  }, [currentDate])
  const possibleCheckinWindow = useMemo(() => checkinWindowLabel(currentDate, todaysSessions), [currentDate, todaysSessions])

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-2 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:gap-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded-[22px] bg-white p-2 shadow-sm">
          <div className="rounded-2xl bg-[#154c83] px-3 py-1.5 text-xs font-semibold text-white sm:text-sm">BoxGym Check-in</div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 sm:px-4 sm:py-2 sm:text-sm">
            QR-Zugang aktiv
          </div>
        </div>

        <div className="overflow-hidden rounded-[22px] shadow-xl md:rounded-[28px]">
          <div className="relative bg-[#0f2740] px-4 py-4 text-white sm:px-6 sm:py-8 md:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(230,51,42,0.25),transparent_35%)]" />
            <div className="relative grid gap-3 md:grid-cols-[1.45fr_1fr] md:items-center md:gap-6">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] sm:mb-3 sm:px-3 sm:text-sm">
                  Willkommen im BoxGym
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                  <Image
                    src="/BoxGym Kompakt.png"
                    alt="TSV Falkensee BoxGym"
                    width={192}
                    height={128}
                    className="h-8 w-auto rounded-md bg-white/90 p-1 sm:h-32"
                  />
                  <div className="min-w-0">
                    <h1 className="text-lg font-bold tracking-tight sm:text-3xl">Check-in auswählen</h1>
                    <div className="mt-1 hidden text-[11px] leading-4 text-blue-50/85 sm:block sm:text-base sm:leading-6">
                      Mitglied oder Probetraining direkt für die heutige Einheit öffnen.
                    </div>
                  </div>
                </div>
              </div>

              <Card className="rounded-[24px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                <CardContent className="p-3.5 sm:p-5">
                  <div className="grid gap-2.5 text-xs sm:grid-cols-2 sm:gap-3 sm:text-sm">
                    <div className="rounded-2xl bg-white/10 p-2.5 sm:col-span-2 sm:p-3">
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Clock3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span>Aktuell</span>
                      </div>
                      <div className="mt-1 font-semibold">{displayDate}</div>
                      <div className="mt-1 text-xl font-bold sm:text-2xl">{displayTime}</div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-2.5 sm:p-3">
                      <div className="text-zinc-300">Mögliche Check-in-Zeit</div>
                      <div className="mt-1 font-semibold">{possibleCheckinWindow}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <Button
            asChild
            variant="outline"
            className="h-auto min-h-24 justify-start rounded-[24px] border border-[#d8e3ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] px-4 py-4 text-left shadow-sm hover:border-[#154c83] hover:bg-[linear-gradient(180deg,#ffffff_0%,#f2f7fb_100%)] sm:px-6"
          >
            <Link href="/checkin/mitglied">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-[#154c83] p-3 text-white shadow-sm">
                  <Users className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-zinc-900">Mitglieder-Check-in</div>
                  <div className="mt-1 text-sm leading-6 text-zinc-500">Vorhandene Mitglieder direkt für eine heutige Einheit einchecken.</div>
                </div>
              </div>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="h-auto min-h-24 justify-start rounded-[24px] border border-[#d8e3ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] px-4 py-4 text-left shadow-sm hover:border-[#154c83] hover:bg-[linear-gradient(180deg,#ffffff_0%,#f2f7fb_100%)] sm:px-6"
          >
            <Link href="/checkin/probetraining">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-[#154c83] p-3 text-white shadow-sm">
                  <UserPlus className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-zinc-900">Probetraining</div>
                  <div className="mt-1 text-sm leading-6 text-zinc-500">Neue Gäste für eine heutige Einheit anmelden.</div>
                </div>
              </div>
            </Link>
          </Button>
        </div>

        <Card className="rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Weitere Route</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Button asChild variant="outline" className="min-h-12 w-full rounded-2xl">
              <Link href="/registrieren">Zur Mitgliederregistrierung</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
