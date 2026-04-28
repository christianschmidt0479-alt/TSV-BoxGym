
import Link from "next/link"
import { MemberAreaBrandHeader } from "@/components/member-area/MemberAreaBrandHeader"
import { FormContainer } from "@/components/ui/form-container"

export default function RegistrierenAuswahlPage() {
  return (
    <FormContainer title="Registrierung" description="Wähle den passenden Einstieg für dein Training.">
      <div className="space-y-5">
        <MemberAreaBrandHeader
          title="Probetraining / Registrierung"
          subtitle="Sicher und mobil in wenigen Schritten"
        />

        <div className="space-y-3">
          <Link
            href="/registrieren/mitglied"
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-[#154c83] px-4 text-base font-semibold text-white transition hover:bg-[#123d69]"
          >
            Als Mitglied registrieren (Boxen)
          </Link>

          <Link
            href="/registrieren/probe"
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            Probetraining starten
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
          <p className="font-semibold text-zinc-900">Hinweis</p>
          <p className="mt-1">
            Die Registrierung dient der Teilnahme am Boxtraining.
            Die offizielle Vereinsmitgliedschaft erfolgt separat über den TSV Falkensee.
          </p>
        </div>

        <Link
          href="https://tsv-falkensee.de"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
        >
          Offizielle TSV Mitgliedschaft
        </Link>
      </div>
    </FormContainer>
  )
}
