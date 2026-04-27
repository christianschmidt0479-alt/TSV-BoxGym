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
    <main className="min-h-screen bg-gray-50 px-4 pt-8 pb-12 flex items-start justify-center">
      <div className="w-full max-w-md mt-4 text-center">
        <div className="w-full rounded-3xl bg-white px-8 py-10 ring-1 ring-zinc-200">
          <div className="mb-6 rounded-xl bg-white border border-gray-200 p-6 text-center">
            <Image
              src="/logo.png"
              alt="TSV Falkensee BoxGym"
              width={220}
              height={242}
              className="mx-auto mb-4 h-20 w-auto"
              priority
            />
            <h1 className="text-3xl font-bold text-zinc-900">TSV BoxGym</h1>
            <p className="mt-2 text-sm font-medium text-zinc-700">Der Bereich Boxen im TSV Falkensee.</p>
            <p className="mt-2 text-base font-medium text-zinc-700">Mitgliederbereich Boxen</p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Zugang nur für Mitglieder des TSV Falkensee. Hier kannst du dich für den Bereich Boxen registrieren oder einloggen.
            </p>
          </div>

          <div className="mt-4 space-y-4 text-center">
            <Link
              href="/mein-bereich/login"
              className="flex w-full flex-col items-center justify-center rounded-md bg-[#0f2a44] px-4 py-3 text-white hover:bg-[#13365a]"
            >
              <span className="text-sm font-medium">Einloggen</span>
              <span className="text-xs text-white/80">Für bestehende Mitglieder</span>
            </Link>
            <Link
              href="/registrieren"
              className="flex w-full flex-col items-center justify-center rounded-xl border border-zinc-300 px-4 py-3 text-zinc-800 hover:bg-zinc-50"
            >
              <span className="text-sm font-medium">Registrieren</span>
              <span className="text-xs text-zinc-500">Für den Bereich Boxen</span>
            </Link>
            <Link href="/trainer-zugang" className="block w-full">
              <button className="w-full border border-gray-300 text-gray-900 py-3 rounded-md text-sm font-medium" type="button">
                Trainer / Admin Zugang
              </button>
            </Link>
            <p className="text-xs text-gray-500 -mt-2">
              Zugang für Trainer und Administratoren
            </p>
            <Link
              href="https://tsv-falkensee.de/service/mitgliedschaft/"
              target="_blank"
              rel="noopener noreferrer"
              title="Mitglied beim TSV Falkensee werden"
              className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              TSV-Mitglied werden
            </Link>
          </div>

          <div className="text-xs text-gray-500 text-center mt-4">
            Voraussetzung für die Teilnahme am Boxtraining ist eine Mitgliedschaft im TSV Falkensee.
          </div>

          <p className="text-xs leading-5 text-zinc-400">
            Check-in erfolgt vor Ort per QR-Code oder NFC am Eingang.
          </p>
        </div>
      </div>
    </main>
  )
}
