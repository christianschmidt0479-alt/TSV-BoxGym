import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { LayoutPanelLeft } from "lucide-react"
import { TRAINER_SESSION_COOKIE, verifyTrainerSessionToken } from "@/lib/authSession"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { AdminMobileNav } from "@/components/admin-mobile-nav"
import { AdminTopNav } from "@/components/admin-top-nav"
import { TrainerLogoutButton } from "@/components/trainer-logout-button"

export default async function VerwaltungLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const trainerAccess = await verifyTrainerSessionToken(cookieStore.get(TRAINER_SESSION_COOKIE)?.value)
  const checkinSettings = await readCheckinSettings()
  const isAdmin = trainerAccess?.role === "admin" || trainerAccess?.accountRole === "admin"
  const mobileSections = [
    {
      title: "Übersicht",
      items: [
        { href: "/verwaltung", label: "Start" },
        { href: "/verwaltung/heute", label: "Heute" },
      ],
    },
    {
      title: "Mitglieder",
      items: [
        { href: "/verwaltung/freigaben", label: "Freigaben" },
        { href: "/verwaltung/mitglieder", label: "Mitglieder" },
        ...(isAdmin ? [{ href: "/verwaltung/geburtstage", label: "Geburtstage" }] : []),
        ...(isAdmin ? [{ href: "/verwaltung/personen", label: "Rollen" }, { href: "/verwaltung/trainer", label: "Trainer" }] : []),
      ],
    },
    {
      title: "Training",
      items: [
        { href: "/verwaltung/checkins", label: "Check-ins" },
        { href: "/verwaltung/excel-abgleich", label: "Excel-Abgleich" },
        { href: "/verwaltung/gruppen", label: "Gruppen" },
        { href: "/verwaltung/wettkampf", label: "Wettkampf" },
        { href: "/verwaltung/qr-codes", label: "QR-Codes" },
      ],
    },
    {
      title: "System",
      items: [
        { href: "/verwaltung/postfach", label: "Postfach" },
        ...(isAdmin ? [{ href: "/verwaltung/sicherheit", label: "Sicherheit" }] : []),
        ...(isAdmin ? [{ href: "/verwaltung/einstellungen", label: "Einstellungen" }] : []),
      ...(isAdmin ? [{ href: '/verwaltung/ki', label: 'KI' }] : []),
        ...(isAdmin ? [{ href: '/verwaltung/fehler', label: 'Fehler' }] : []),
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(21,76,131,0.16),_transparent_34%),linear-gradient(180deg,_#f8fbff_0%,_#f5f7fa_44%,_#eef3f8_100%)] text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-[#cdd9e6] bg-[#f4f8fd]/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-2 md:px-6">
          <div className="relative rounded-[22px] border border-[#d0dff0] bg-white shadow-[0_4px_16px_rgba(21,76,131,0.08)]">
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[22px]">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#154c83] to-[#2a6fc8]" />
              <div className="absolute -right-8 top-0 h-14 w-14 rounded-full bg-[#154c83]/6 blur-2xl" />
            </div>

            <div className="flex flex-col gap-2 px-4 py-3 md:gap-3 md:px-5 md:py-3.5">
              <div className="flex flex-row items-center justify-between gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80 sm:gap-3">
                  <Image src="/boxgym-headline-old.png" alt="TSV Falkensee BoxGym" width={40} height={17} className="h-auto w-[17px] object-contain sm:w-[20px] md:w-auto" priority />
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#eef4fb] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#154c83] md:px-3 md:text-[11px] md:tracking-[0.18em]">
                      <LayoutPanelLeft className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Verwaltung</span>
                      <span className="md:hidden">Admin</span>
                    </div>
                    <h1 className="mt-1 text-sm font-bold tracking-tight text-[#154c83] sm:text-base md:mt-1.5 md:text-lg">TSV BoxGym</h1>
                  </div>
                </Link>

                <div className="flex items-center gap-2 md:gap-3">
                  <div className="md:hidden">
                    <AdminMobileNav sections={mobileSections} />
                  </div>
                  {checkinSettings.disableCheckinTimeWindow ? (
                    <div className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 shadow-sm">
                      Ferienmodus aktiv
                    </div>
                  ) : null}
                  <TrainerLogoutButton
                    iconOnly
                    className="rounded-xl border-[#cfd9e4] bg-white px-2 py-1.5 text-sm font-medium text-zinc-700 hover:border-[#154c83] hover:bg-[#f7fbff] md:hidden"
                  />
                </div>
              </div>

              <div className="hidden items-center justify-between border-t border-[#e2e8f0] pt-2.5 md:flex">
                <AdminTopNav isAdmin={isAdmin} />
              </div>
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
