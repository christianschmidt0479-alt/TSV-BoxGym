import Image from "next/image"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import Link from "next/link"
import { MEMBER_AREA_SESSION_COOKIE } from "@/lib/publicAreaSession"
import { resolveUserContext } from "@/lib/resolveUserContext"

export default async function Home() {
  const cookieStore = await cookies()
  const hasCookie = Boolean(cookieStore.get(MEMBER_AREA_SESSION_COOKIE)?.value)

  if (hasCookie) {
    const ctx = await resolveUserContext()
    if (ctx.isMember) {
      redirect("/mein-bereich/dashboard")
    }
  }

  return (
    <main className="bg-zinc-50 px-4 py-3 text-zinc-900 md:px-6 md:py-5 flex justify-center">
      <div className="w-full max-w-md text-center">
        <div className="min-h-[calc(100svh-11rem)] rounded-[24px] border border-[#d8e3ee] bg-white px-4 py-4 shadow-sm flex flex-col justify-between gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-center">
            <div className="mx-auto inline-flex items-center justify-center rounded-xl bg-white/95 px-3 py-2 shadow-sm">
              <Image
                src="/logo.png"
                alt="TSV Falkensee BoxGym"
                width={220}
                height={242}
                className="h-12 w-auto object-contain"
                priority
              />
            </div>
            <h1 className="mt-2 text-2xl font-bold text-zinc-900">TSV BoxGym</h1>
            <p className="mt-1 text-sm font-medium text-zinc-700">Mitgliederbereich des TSV Falkensee</p>
          </div>

          <div className="flex-1 flex items-center">
            <div className="w-full space-y-3 text-center">
              <Link
                href="/mein-bereich/login"
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#154c83] px-4 text-base font-semibold text-white hover:bg-[#123d69]"
              >
                Mitglieder Login
              </Link>
              <Link
                href="/registrieren"
                className="flex h-14 w-full items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Probetraining / Registrierung
              </Link>
              <Link href="/trainer-zugang" className="flex h-14 w-full items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900 px-4 text-base font-semibold text-white hover:bg-zinc-800">
                Trainer / Verwaltung
              </Link>
            </div>
          </div>

          <div className="space-y-2 text-center">
            <Link
              href="https://tsv-falkensee.de/service/mitgliedschaft/"
              target="_blank"
              rel="noopener noreferrer"
              title="Mitglied beim TSV Falkensee werden"
              className="flex h-11 w-full items-center justify-center rounded-2xl border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              TSV-Mitglied werden
            </Link>
            <p className="text-xs text-zinc-500">Voraussetzung für die Teilnahme am Boxtraining ist eine TSV-Mitgliedschaft.</p>
            <p className="text-xs leading-5 text-zinc-400">Check-in erfolgt vor Ort per QR-Code oder NFC am Eingang.</p>
          </div>
        </div>
      </div>
    </main>
  )
}
