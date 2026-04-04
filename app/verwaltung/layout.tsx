import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { ChevronLeft, LayoutPanelLeft, Settings } from "lucide-react"
import { TRAINER_SESSION_COOKIE, verifyTrainerSessionToken } from "@/lib/authSession"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { AdminMobileNav } from "@/components/admin-mobile-nav"
import { TrainerLogoutButton } from "@/components/trainer-logout-button"

type NavItem = {
  href: string
  label: string
  icon?: ReactNode
}

export default async function VerwaltungLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const trainerAccess = await verifyTrainerSessionToken(cookieStore.get(TRAINER_SESSION_COOKIE)?.value)
  const checkinSettings = await readCheckinSettings()
  const isAdmin = trainerAccess?.role === "admin" || trainerAccess?.accountRole === "admin"
  const startItems: NavItem[] = [
    { href: "/verwaltung", label: "Übersicht" },
    { href: "/verwaltung/inbox", label: "Inbox" },
  ]
  const peopleItems: NavItem[] = [
    { href: "/verwaltung/freigaben", label: "Freigaben" },
    { href: "/verwaltung/mitglieder", label: "Mitglieder" },
    ...(isAdmin ? [{ href: "/verwaltung/geburtstage", label: "Geburtstage" }] : []),
    ...(isAdmin ? [{ href: "/verwaltung/personen", label: "Rollen" }, { href: "/verwaltung/trainer", label: "Trainer" }] : []),
  ]
  const operationsItems: NavItem[] = [
    { href: "/verwaltung/heute", label: "Heute" },
    { href: "/verwaltung/checkins", label: "Check-ins" },
    { href: "/verwaltung/excel-abgleich", label: "Excel-Abgleich" },
    { href: "/verwaltung/gruppen", label: "Gruppen" },
    { href: "/verwaltung/wettkampf", label: "Wettkampf" },
    { href: "/verwaltung/qr-codes", label: "QR-Codes" },
  ]
  const systemItems: NavItem[] = [
    { href: "/verwaltung/postfach", label: "Postfach" },
    { href: "/verwaltung/mail", label: "Mail" },
    ...(isAdmin ? [{ href: "/verwaltung/sicherheit", label: "Sicherheit" }] : []),
    ...(isAdmin ? [{ href: "/verwaltung/einstellungen", label: "Einstellungen", icon: <Settings className="h-4 w-4" /> }] : []),
  ]
  const mobileSections = [
    { title: "Start", items: startItems.map(({ href, label }) => ({ href, label })) },
    { title: "Personen", items: peopleItems.map(({ href, label }) => ({ href, label })) },
    { title: "Betrieb", items: operationsItems.map(({ href, label }) => ({ href, label })) },
    { title: "System", items: systemItems.map(({ href, label }) => ({ href, label })) },
  ]

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(21,76,131,0.16),_transparent_34%),linear-gradient(180deg,_#f8fbff_0%,_#f5f7fa_44%,_#eef3f8_100%)] text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-[#cdd9e6] bg-white/92 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-2 md:px-6">
          <div className="relative overflow-hidden rounded-[22px] border border-[#d8e3ee] bg-white shadow-[0_10px_24px_rgba(15,39,64,0.06)]">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-[#154c83]" />
            <div className="absolute -right-8 top-0 h-14 w-14 rounded-full bg-[#e6332a]/8 blur-2xl" />

            <div className="flex flex-col gap-2 px-4 py-3 md:gap-3 md:px-5 md:py-3.5">
              <div className="flex flex-row items-center justify-between gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Image src="/boxgym-headline-old.png" alt="TSV Falkensee BoxGym" width={40} height={17} className="h-auto w-[17px] object-contain sm:w-[20px] md:w-auto" priority />
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#eef4fb] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#154c83] md:px-3 md:text-[11px] md:tracking-[0.18em]">
                      <LayoutPanelLeft className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Admin-Modus</span>
                      <span className="md:hidden">Admin</span>
                    </div>
                    <h1 className="mt-1 text-sm font-black tracking-tight text-[#0f4f8c] sm:text-base md:mt-1.5 md:text-xl">Verwaltung</h1>
                  </div>
                </div>

                <div className="flex items-center gap-2 md:flex-wrap md:gap-3">
                  <div className="md:hidden">
                    <AdminMobileNav sections={mobileSections} />
                  </div>
                  {checkinSettings.disableCheckinTimeWindow ? (
                    <div className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 shadow-sm">
                      Ferienmodus aktiv
                    </div>
                  ) : null}
                  <TrainerLogoutButton className="rounded-2xl border-[#cfd9e4] bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-[#154c83] hover:bg-[#f7fbff] md:px-3.5" />
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#cfd9e4] bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-[#154c83] hover:bg-[#f7fbff] md:px-3.5"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Startseite</span>
                    <span className="sm:hidden">Start</span>
                  </Link>
                </div>
              </div>

              <nav className="hidden flex-wrap gap-2.5 border-t border-[#e2e8f0] pt-2.5 md:flex">
                <Link
                  href="/verwaltung"
                  className="rounded-2xl border border-[#154c83] bg-[#154c83] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#123d69]"
                >
                  Übersicht
                </Link>
                <div className="self-center px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Start
                </div>
                <Link
                  href="/verwaltung/inbox"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Inbox
                </Link>
                <div className="self-center px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Personen
                </div>
                <Link
                  href="/verwaltung/freigaben"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Freigaben
                </Link>
                <Link
                  href="/verwaltung/mitglieder"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Mitglieder
                </Link>
                {isAdmin ? (
                  <Link
                    href="/verwaltung/geburtstage"
                    className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                  >
                    Geburtstage
                  </Link>
                ) : null}
                {isAdmin ? (
                  <Link
                    href="/verwaltung/personen"
                    className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                  >
                    Rollen
                  </Link>
                ) : null}
                {isAdmin ? (
                  <Link
                    href="/verwaltung/trainer"
                    className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                  >
                    Trainer
                  </Link>
                ) : null}
                <div className="self-center px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Betrieb
                </div>
                <Link
                  href="/verwaltung/heute"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Heute
                </Link>
                <Link
                  href="/verwaltung/checkins"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Check-ins
                </Link>
                <Link
                  href="/verwaltung/excel-abgleich"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Excel-Abgleich
                </Link>
                <Link
                  href="/verwaltung/gruppen"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Gruppen
                </Link>
                <Link
                  href="/verwaltung/wettkampf"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Wettkampf
                </Link>
                <Link
                  href="/verwaltung/qr-codes"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  QR-Codes
                </Link>
                <div className="self-center px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  System
                </div>
                <Link
                  href="/verwaltung/postfach"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Postfach
                </Link>
                <Link
                  href="/verwaltung/mail"
                  className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                >
                  Mail
                </Link>
                {isAdmin ? (
                  <Link
                    href="/verwaltung/sicherheit"
                    className="rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                  >
                    Sicherheit
                  </Link>
                ) : null}
                {isAdmin ? (
                  <Link
                    href="/verwaltung/einstellungen"
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-[#dfeaf7]"
                  >
                    <Settings className="h-4 w-4" />
                    Einstellungen
                  </Link>
                ) : null}
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
