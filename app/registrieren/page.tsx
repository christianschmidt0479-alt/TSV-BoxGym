
import Link from "next/link"

export default function RegistrierenAuswahlPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900 md:px-6">
      <div className="mx-auto max-w-xl space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Zugang zum BoxGym erstellen</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Hier registrierst du dich für den Trainingsbereich Boxen im TSV Falkensee.
            Dies ist noch keine vollständige Vereinsmitgliedschaft im TSV Falkensee.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/registrieren/mitglied"
            className="flex w-full items-center justify-center rounded-xl bg-[#154c83] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#113f6c]"
          >
            Als Mitglied registrieren (Boxen)
          </Link>

          <Link
            href="/registrieren/probe"
            className="flex w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            Probetraining starten
          </Link>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
          <p className="font-semibold text-zinc-900">Hinweis:</p>
          <p className="mt-1">
            Die Registrierung dient der Teilnahme am Boxtraining.
            Die offizielle Vereinsmitgliedschaft erfolgt separat über den TSV Falkensee.
          </p>
        </div>

        <Link
          href="https://tsv-falkensee.de"
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
        >
          Offizielle TSV Mitgliedschaft
        </Link>
      </div>
    </div>
  )
}
