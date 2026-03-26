"use client"

export const dynamic = "force-dynamic"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, Lock, ShieldCheck, UserCircle2, UserRoundPlus, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

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

function liveDateString(date: Date | null) {
  if (!date) return "—"
  return date.toLocaleDateString("de-DE")
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
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "dev"

  useEffect(() => {
    const updateNow = () => setNow(new Date())
    updateNow()
    const interval = window.setInterval(updateNow, 60000)
    return () => window.clearInterval(interval)
  }, [])

  const navigationCards: NavigationCard[] = [
    {
      href: "/checkin",
      title: "Check-in",
      description: "Mitglieder und Probetraining schnell und einfach öffnen.",
      icon: Users,
      accentClass: "bg-[#154c83] text-white",
    },
    {
      href: "/registrieren",
      title: "Registrieren",
      description: "Neue Mitgliedschaft übersichtlich auf der eigenen Seite starten.",
      icon: UserRoundPlus,
      accentClass: "bg-[#154c83] text-white",
    },
    {
      href: "/mein-bereich",
      title: "Mein Bereich",
      description: "Persönliche Daten und wichtige Informationen direkt aufrufen.",
      icon: UserCircle2,
      accentClass: "bg-white text-[#154c83] border border-[#d8e3ee]",
    },
    {
      href: "/trainer",
      title: "Trainer",
      description: "Trainerzugang und Tagesübersicht auf einer separaten Seite.",
      icon: Lock,
      accentClass: "bg-white text-[#154c83] border border-[#d8e3ee]",
    },
  ]

  return (
    <div className={`min-h-screen ${brand.light} text-zinc-900`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="rounded-2xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white">Startseite</div>
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="capitalize">{now ? now.toLocaleDateString("de-DE", { weekday: "long" }) : "—"}</span>
            <span>·</span>
            <span>{liveDateString(now)}</span>
            <span>·</span>
            <span>{liveTimeString(now)}</span>
            <span className="text-zinc-300">·</span>
            <span className="text-xs text-zinc-400">v{appVersion}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] shadow-xl">
          <div className={`${brand.dark} relative px-5 py-6 text-white sm:px-6 sm:py-8 md:px-8`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(230,51,42,0.25),transparent_35%)]" />
            <div className="relative grid gap-4 lg:grid-cols-[1.35fr_0.9fr] lg:items-center">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm">
                  <ShieldCheck className="h-4 w-4" />
                  <span>TSV Falkensee · BoxGym</span>
                </div>
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="rounded-2xl bg-white/90 p-2 shadow-sm">
                    <Image
                      src="/BoxGym Kompakt.png"
                      alt="TSV BoxGym"
                      width={144}
                      height={144}
                      className="h-14 w-auto object-contain sm:h-20"
                      priority
                    />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Willkommen im TSV BoxGym</h1>
                    <p className="max-w-2xl text-sm leading-6 text-blue-50/85 sm:text-base">
                      Check-in, Registrierung und wichtige Zugänge schnell und übersichtlich.
                    </p>
                  </div>
                </div>
              </div>

              <Card className="rounded-[24px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                <CardContent className="grid gap-2.5 p-3.5 sm:grid-cols-2 sm:p-4">
                  <div className="flex h-full flex-col justify-between rounded-2xl bg-white/10 p-2.5">
                    <div className="text-xs uppercase tracking-wide text-zinc-300">Fokus</div>
                    <div className="mt-1 text-sm font-semibold leading-snug">Startseite mit klaren Wegen</div>
                  </div>
                  <div className="flex h-full flex-col justify-between rounded-2xl bg-white/10 p-2.5">
                    <div className="text-xs uppercase tracking-wide text-zinc-300">Check-in</div>
                    <div className="mt-1 text-sm font-semibold leading-snug">Mit Gruppenwahl auf eigener Seite</div>
                  </div>
                  <div className="flex h-full flex-col justify-between rounded-2xl bg-white/10 p-2.5 sm:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-zinc-300">Hinweis</div>
                    <div className="mt-1 text-sm font-semibold leading-snug">Alle wichtigen Bereiche sind direkt erreichbar und mobil gut nutzbar.</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
          {navigationCards.map((card, index) => {
            const Icon = card.icon

            return (
              <Button
                key={card.href}
                asChild
                variant="outline"
                className={`h-auto min-h-24 w-full justify-start rounded-[24px] border border-[#d8e3ee] bg-white px-4 py-4 text-left shadow-sm transition-all hover:border-[#154c83] hover:bg-zinc-50 hover:shadow-md active:bg-zinc-100 sm:px-5 ${
                  index === navigationCards.length - 1 ? "md:col-span-2" : ""
                }`}
              >
                <Link href={card.href}>
                  <div className="flex min-h-[96px] w-full items-center justify-between gap-3 sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-2xl ${card.accentClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex min-w-0 flex-col justify-center self-center">
                        <div className="text-base font-semibold text-zinc-900 sm:text-lg">{card.title}</div>
                        <div className="mt-1 text-sm leading-5 text-zinc-500">{card.description}</div>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 self-center text-zinc-400" />
                  </div>
                </Link>
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
