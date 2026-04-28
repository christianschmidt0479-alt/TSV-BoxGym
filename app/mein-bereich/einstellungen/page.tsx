import Link from "next/link"
import { MemberAreaBrandHeader } from "@/components/member-area/MemberAreaBrandHeader"
import { FormContainer } from "@/components/ui/form-container"

export default function EinstellungenPage() {
  return (
    <FormContainer title="Einstellungen" description="Kontodaten und Sicherheit verwalten">
      <div className="space-y-5">
        <MemberAreaBrandHeader
          title="Einstellungen"
          subtitle="Verwalte dein Profil und deine Sicherheit"
        />

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Wähle einen Bereich aus, den du anpassen möchtest.
        </div>

        <div className="space-y-3">
          <Link
            href="/mein-bereich/einstellungen/daten"
            className="block rounded-2xl border border-zinc-300 bg-white px-4 py-4 hover:border-zinc-400"
          >
            <p className="text-base font-semibold text-zinc-900">Meine Daten</p>
            <p className="mt-1 text-sm text-zinc-600">Name, Kontakt und persönliche Daten</p>
          </Link>

          <Link
            href="/mein-bereich/einstellungen/passwort"
            className="block rounded-2xl border border-zinc-300 bg-white px-4 py-4 hover:border-zinc-400"
          >
            <p className="text-base font-semibold text-zinc-900">Passwort zurücksetzen</p>
            <p className="mt-1 text-sm text-zinc-600">Per E-Mail-Link</p>
          </Link>

          <Link
            href="/mein-bereich/einstellungen/loeschen"
            className="block rounded-2xl border border-red-200 bg-red-50 px-4 py-4 hover:border-red-300"
          >
            <p className="text-base font-semibold text-red-700">Account löschen beantragen</p>
            <p className="mt-1 text-sm text-red-600">Anfrage wird vom Verein geprüft</p>
          </Link>
        </div>
      </div>
    </FormContainer>
  )
}
