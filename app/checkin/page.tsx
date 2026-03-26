"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Clock3, UserPlus, UserRoundPlus, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"

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

export default function CheckinLandingPage() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const sync = () => setNow(new Date())
    sync()
    const interval = window.setInterval(sync, 1000)
    return () => window.clearInterval(interval)
  }, [])

  const displayDate = now ? dateLabel(now) : "—"
  const displayTime = now ? timeLabel(now) : "—"

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-2 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:gap-6">
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
                    <h1 className="text-lg font-bold tracking-tight sm:text-3xl">Willkommen im BoxGym</h1>
                    <div className="mt-1 hidden items-center gap-2 text-[11px] leading-4 text-blue-50/85 sm:flex sm:text-base sm:leading-6">
                      <span>Bereich auswählen.</span>
                      <InfoHint text="Bitte jetzt den passenden Bereich auswählen." />
                    </div>
                  </div>
                </div>
                <details className="mt-3 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-blue-50 sm:hidden">
                  <summary className="cursor-pointer list-none font-semibold">Mehr Infos</summary>
                  <div className="mt-2 space-y-1 text-blue-50/85">
                    <div>Mitglied, Probetraining oder Eintritt auswählen.</div>
                    <div>Der Check-in öffnet sich automatisch zur Trainingszeit.</div>
                  </div>
                </details>
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
                      <div className="text-zinc-300">Zugang</div>
                      <div className="mt-1 font-semibold">Per QR-Code</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:gap-4">
          <Button
            asChild
            variant="outline"
            className="h-auto min-h-20 justify-start rounded-[24px] border border-[#d8e3ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] px-4 py-3 text-left shadow-sm hover:border-[#154c83] hover:bg-[linear-gradient(180deg,#ffffff_0%,#f2f7fb_100%)] sm:min-h-24 sm:px-6 sm:py-4"
          >
            <Link href="/checkin/mitglied">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="rounded-2xl bg-[#154c83] p-2.5 text-white shadow-sm sm:p-3">
                  <Users className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-zinc-900">Mitglied</div>
                  <div className="hidden text-sm leading-6 text-zinc-500 sm:block">Vorhandenes Mitglied direkt einchecken</div>
                </div>
              </div>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="h-auto min-h-20 justify-start rounded-[24px] border border-[#d8e3ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] px-4 py-3 text-left shadow-sm hover:border-[#154c83] hover:bg-[linear-gradient(180deg,#ffffff_0%,#f2f7fb_100%)] sm:min-h-24 sm:px-6 sm:py-4"
          >
            <Link href="/checkin/probetraining">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="rounded-2xl bg-[#154c83] p-2.5 text-white shadow-sm sm:p-3">
                  <UserPlus className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-zinc-900">Probetraining</div>
                  <div className="hidden text-sm leading-6 text-zinc-500 sm:block">Neuen Gast für heute anmelden</div>
                </div>
              </div>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="h-auto min-h-20 justify-start rounded-[24px] border border-[#d8e3ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] px-4 py-3 text-left shadow-sm hover:border-[#154c83] hover:bg-[linear-gradient(180deg,#ffffff_0%,#f2f7fb_100%)] sm:min-h-24 sm:px-6 sm:py-4"
          >
            <Link href="/checkin/beitritt">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="rounded-2xl bg-[#154c83] p-2.5 text-white shadow-sm sm:p-3">
                  <UserRoundPlus className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-zinc-900">Boxbereich beitreten</div>
                  <div className="hidden text-sm leading-6 text-zinc-500 sm:block">Neue Anmeldung für den Boxbereich starten</div>
                </div>
              </div>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
