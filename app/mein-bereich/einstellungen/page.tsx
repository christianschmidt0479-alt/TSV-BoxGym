import Link from "next/link"
import { FormContainer } from "@/components/ui/form-container"

export default function EinstellungenPage() {
  return (
    <FormContainer title="Einstellungen" description="Kontodaten und Sicherheit verwalten">
      <div className="space-y-3">
        <Link
          href="/mein-bereich/einstellungen/daten"
          className="block rounded-xl border border-zinc-300 bg-white px-4 py-3 hover:border-zinc-400"
        >
          <p className="text-sm font-semibold text-zinc-900">Meine Daten</p>
          <p className="text-xs text-zinc-600">Name, Kontakt und persönliche Daten</p>
        </Link>

        <Link
          href="/mein-bereich/einstellungen/passwort"
          className="block rounded-xl border border-zinc-300 bg-white px-4 py-3 hover:border-zinc-400"
        >
          <p className="text-sm font-semibold text-zinc-900">Passwort zurücksetzen</p>
          <p className="text-xs text-zinc-600">Per E-Mail-Link</p>
        </Link>

        <Link
          href="/mein-bereich/einstellungen/loeschen"
          className="block rounded-xl border border-red-200 bg-red-50 px-4 py-3 hover:border-red-300"
        >
          <p className="text-sm font-semibold text-red-700">Account löschen beantragen</p>
          <p className="text-xs text-red-600">Anfrage wird vom Verein geprüft</p>
        </Link>
      </div>
    </FormContainer>
  )
}
