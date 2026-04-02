import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { ChevronLeft, ClipboardCheck } from "lucide-react"
import { APP_VERSION } from "@/lib/appVersion"
import { TrainerLogoutButton } from "@/components/trainer-logout-button"

export default function TrainerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(230,51,42,0.12),_transparent_26%),linear-gradient(180deg,_#f7fbff_0%,_#f3f7fb_42%,_#eef3f8_100%)] text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-[#cdd9e6] bg-white/92 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-2 md:px-6">
          <div className="relative overflow-hidden rounded-[22px] border border-[#d8e3ee] bg-white shadow-[0_10px_24px_rgba(15,39,64,0.06)]">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-[#154c83]" />
            <div className="absolute right-0 top-0 h-14 w-14 rounded-full bg-[#e6332a]/10 blur-2xl" />

            <div className="flex flex-col gap-3 px-4 py-3 md:px-5 md:py-3.5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Image src="/boxgym-headline-old.png" alt="TSV Falkensee BoxGym" width={66} height={28} className="h-auto w-[28px] object-contain sm:w-[33px] md:w-auto" priority />
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#eef4fb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#154c83]">
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Trainer-Modus
                    </div>
                    <h1 className="mt-1.5 text-base font-black tracking-tight text-[#154c83] sm:text-lg md:text-xl">Trainerbereich</h1>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <TrainerLogoutButton className="rounded-2xl border-[#cfd9e4] bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 hover:border-[#154c83] hover:bg-[#f7fbff]" />
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#cfd9e4] bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-[#154c83] hover:bg-[#f7fbff]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Startseite
                  </Link>
                  <div className="rounded-full border border-[#d8e3ee] bg-[#f7fbff] px-3 py-1 text-xs font-semibold text-[#154c83]">
                    Version {APP_VERSION}
                  </div>
                </div>
              </div>

              <nav className="flex flex-wrap gap-2.5 border-t border-[#e2e8f0] pt-2.5">
                <Link
                  href="/trainer"
                  className="rounded-2xl border border-[#154c83] bg-[#154c83] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#123d69]"
                >
                  Übersicht
                </Link>
                <div className="self-center px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Start
                </div>
                <Link
                  href="/trainer/heute"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Heute
                </Link>
                <div className="self-center px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Sportler
                </div>
                <Link
                  href="/trainer/boxzwerge"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Boxzwerge
                </Link>
                <Link
                  href="/trainer/mitglieder"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Mitglieder
                </Link>
                <Link
                  href="/trainer/wettkampf"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Wettkampf
                </Link>
                <div className="self-center px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Mehr
                </div>
                <Link
                  href="/verwaltung/checkins"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Check-ins
                </Link>
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
