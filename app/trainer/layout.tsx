"use client"

import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { ClipboardCheck } from "lucide-react"
import { TrainerMobileNav } from "@/components/trainer-mobile-nav"

const NAV_SECTIONS = [
  {
    title: "Start",
    items: [
      { href: "/trainer", label: "Übersicht" },
      { href: "/trainer/heute", label: "Heute" },
    ],
  },
  {
    title: "Sportler",
    items: [
      // { href: "/trainer/boxzwerge", label: "Boxzwerge" }, // Boxzwerge-Navigationseintrag entfernt
      { href: "/trainer/mitglieder", label: "Mitglieder" },
      { href: "/trainer/wettkampf", label: "Wettkampf" },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/trainer/ki-trainingstools", label: "KI Trainingstools" },
    ],
  },
]

const NAV_LINKS = NAV_SECTIONS.flatMap((s) => s.items)

function TrainerNavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = pathname === href
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-2xl border border-[#154c83] bg-[#154c83] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#123d69]"
          : "rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
      }
    >
      {label}
    </Link>
  )
}

export default function TrainerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [ferienModus, setFerienModus] = useState(false)

  useEffect(() => {
    fetch("/api/public/checkin-settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { disableCheckinTimeWindow?: boolean } | null) => {
        if (data?.disableCheckinTimeWindow) setFerienModus(true)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(230,51,42,0.12),_transparent_26%),linear-gradient(180deg,_#f7fbff_0%,_#f3f7fb_42%,_#eef3f8_100%)] text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-[#cdd9e6] bg-white/92 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-2 md:px-6">
          <div className="relative overflow-hidden rounded-[22px] border border-[#d8e3ee] bg-white shadow-[0_10px_24px_rgba(15,39,64,0.06)]">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-[#154c83]" />
            <div className="absolute right-0 top-0 h-14 w-14 rounded-full bg-[#e6332a]/10 blur-2xl" />

            <div className="flex flex-col gap-3 px-4 py-3 md:px-5 md:py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Image src="/boxgym-headline-old.png" alt="TSV Falkensee BoxGym" width={40} height={17} className="h-auto w-[17px] object-contain sm:w-[20px] md:w-auto" priority />
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#eef4fb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#154c83]">
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Trainer-Modus
                    </div>
                    <h1 className="mt-1.5 text-base font-black tracking-tight text-[#154c83] sm:text-lg md:text-xl">Trainerbereich</h1>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <TrainerMobileNav sections={NAV_SECTIONS} />
                  {ferienModus ? (
                    <div className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 shadow-sm">
                      <span className="sm:hidden">Ferien</span>
                      <span className="hidden sm:inline">Ferienmodus aktiv</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <nav className="hidden flex-wrap gap-2.5 border-t border-[#e2e8f0] pt-2.5 md:flex">
                {NAV_LINKS.map((item) => (
                  <TrainerNavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
                ))}
              </nav>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  )
}
