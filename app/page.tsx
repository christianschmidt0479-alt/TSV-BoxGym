"use client"

export const dynamic = "force-dynamic"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Lock, ShieldCheck, UserRoundPlus, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatDisplayDate, formatDisplayWeekday } from "@/lib/dateFormat"

const brand = {
  dark: "bg-[#0f2740]",
  light: "bg-zinc-50",
}

type NavigationCard = {
  href: string
  title: string
  description: string
  icon: typeof Users
  accentClass: string
}

type HeroSession = {
  name: string
  start: string
  end: string
}

type HeroInfoCard = {
  id: "coming" | "live" | "next"
  label: string
  value: string
}

const fallbackSessions: HeroSession[] = [
  { name: "Boxen", start: "18:00", end: "19:30" },
  { name: "Jugend", start: "16:30", end: "17:45" },
]

function parseTimeToDate(time: string, referenceDate: Date) {
  const [hours, minutes] = time.split(":").map(Number)
  const parsed = new Date(referenceDate)
  parsed.setHours(hours, minutes, 0, 0)
  return parsed
}

function isNowBetween(now: Date, start: Date, end: Date) {
  return now.getTime() >= start.getTime() && now.getTime() < end.getTime()
}

function formatSessionCompact(session: HeroSession | null) {
  if (!session) return "—"
  return `${session.start} · ${session.name}`
}

function formatCheckinTime(date: Date | null) {
  if (!date) return "—"
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
}

function formatCheckinRange(checkinTime: Date | null, session: HeroSession | null) {
  if (!checkinTime || !session) return "—"
  return `${formatCheckinTime(checkinTime)} - ${session.end}`
}

function getCurrentSession(referenceDate: Date, sessions: HeroSession[]) {
  return (
    sessions.find((session) => {
      const start = parseTimeToDate(session.start, referenceDate)
      const end = parseTimeToDate(session.end, referenceDate)
      return isNowBetween(referenceDate, start, end)
    }) ?? null
  )
}

function getNextSession(referenceDate: Date, sessions: HeroSession[]) {
  return (
    sessions
      .map((session) => ({
        session,
        startDate: parseTimeToDate(session.start, referenceDate),
      }))
      .filter(({ startDate }) => startDate.getTime() > referenceDate.getTime())
      .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())[0]?.session ?? null
  )
}

function getNextCheckinTime(referenceDate: Date, sessions: HeroSession[]) {
  const nextSession = getNextSession(referenceDate, sessions)
  if (!nextSession) return null
  const nextStart = parseTimeToDate(nextSession.start, referenceDate)
  return new Date(nextStart.getTime() - 15 * 60 * 1000)
}

function liveDateString(date: Date | null) {
  if (!date) return "—"
  return formatDisplayDate(date)
}

function liveTimeString(date: Date | null) {
  if (!date) return "—"
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function Home() {
  const [now, setNow] = useState<Date | null>(null)
  const [sessions, setSessions] = useState<HeroSession[]>([...fallbackSessions])

  useEffect(() => {
    const updateNow = () => setNow(new Date())
    updateNow()
    const interval = window.setInterval(updateNow, 60000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/public/sessions-today")
        if (!response.ok) return

        type SessionApiRow = {
          start?: string
          end?: string
          group?: string
          name?: string
        }

        const payload = (await response.json()) as
          | HeroSession[]
          | {
              data?: SessionApiRow[]
            }

        const rows: SessionApiRow[] = Array.isArray(payload) ? payload : payload.data ?? []
        const normalized = rows
          .map((row) => ({
            name: String(row.name ?? row.group ?? "").trim(),
            start: String(row.start ?? "").trim(),
            end: String(row.end ?? "").trim(),
          }))
          .filter((row) => row.name && row.start && row.end)

        if (normalized.length > 0) {
          setSessions(normalized)
        }
      } catch {
        // Fallback intentionally stays quiet on the homepage.
      }
    })()
  }, [])

  const currentSession = useMemo(() => (now ? getCurrentSession(now, sessions) : null), [now, sessions])
  const nextSession = useMemo(() => (now ? getNextSession(now, sessions) : null), [now, sessions])
  const nextCheckinTime = useMemo(() => (now ? getNextCheckinTime(now, sessions) : null), [now, sessions])

  const navigationCards: NavigationCard[] = [
    {
      href: "/mein-bereich",
      title: "Onlinebereich Boxen",
      description: "Zugang nur für Boxmitglieder",
      icon: Users,
      accentClass: "bg-[#154c83] text-white",
    },
    {
      href: "/mitglied-registrieren",
      title: "Registrierung Onlinebereich Boxen",
      description: "Registrierung für den Onlinebereich Boxen.",
      icon: UserRoundPlus,
      accentClass: "bg-[#154c83] text-white",
    },
    {
      href: "/trainer",
      title: "Trainerzugang",
      description: "Nur für Trainer",
      icon: Lock,
      accentClass: "bg-white text-[#154c83] border border-[#d8e3ee]",
    },
    {
      href: "https://tsv-falkensee.de",
      title: "TSV Mitglied werden",
      description: "Mitglied im TSV Falkensee werden.",
      icon: UserRoundPlus,
      accentClass: "bg-white text-[#154c83] border border-[#d8e3ee]",
    },
  ]

  const heroCards: HeroInfoCard[] = [
    {
      id: "coming",
      label: "Nächste Einheit",
      value: formatSessionCompact(nextSession),
    },
    {
      id: "live",
      label: "Laufende Einheit",
      value: currentSession ? `läuft · ${currentSession.name}` : "—",
    },
    {
      id: "next",
      label: "Nächster Check-in",
      value: formatCheckinRange(nextCheckinTime, nextSession),
    },
  ]

  return (
    <div className={`min-h-screen ${brand.light} text-zinc-900`}>



      <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pt-0 md:p-8 md:pt-0">
        <section className="overflow-hidden rounded-[28px] shadow-xl">
          <div className={`${brand.dark} relative px-5 py-6 text-white sm:px-6 sm:py-8 md:px-8`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(230,51,42,0.25),transparent_35%)]" />
            <div className="relative flex flex-col items-center">
              <img
                src="/assets/logos/boxgym-kompakt.png"
                alt="TSV BoxGym Kompakt Logo"
                className="mx-auto mb-4 w-[72px] sm:w-[90px] md:w-[100px] h-auto"
                style={{ display: 'block' }}
              />
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-center">Willkommen im TSV BoxGym</h1>
              <p className="max-w-2xl text-sm leading-6 text-blue-50/85 sm:text-base mt-2 text-center">
                Check-in, Registrierung und wichtige Zugänge – alles an einem Ort.
              </p>
            </div>
          </div>
        </section>
        <section className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
          {navigationCards.map((card) => {
            const Icon = card.icon
            return (
              <Button
                key={card.href}
                asChild
                variant="outline"
                className="h-auto min-h-24 w-full justify-start rounded-[24px] border border-[#d8e3ee] bg-white px-4 py-4 text-left shadow-sm transition-all hover:border-[#154c83] hover:bg-zinc-50 hover:shadow-md active:bg-zinc-100 sm:px-5"
              >
                <Link href={card.href}>
                  <div className="flex min-h-[96px] w-full items-center justify-between gap-3 sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-2xl ${card.accentClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex min-w-0 flex-col justify-center self-center">
                        <div className="text-base font-semibold text-zinc-900 sm:text-lg">{card.title}</div>
                        <div className="mt-1 break-words text-xs leading-4 text-zinc-500">{card.description}</div>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 self-center text-zinc-400" />
                  </div>
                </Link>
              </Button>
            )
          })}
        </section>
      </main>

      {/* entfernt: doppelter Navigations-Block */}
    </div>
  )
}
