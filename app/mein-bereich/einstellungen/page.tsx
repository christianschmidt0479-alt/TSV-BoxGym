import Link from "next/link"

export default function EinstellungenPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex justify-center px-4 pt-10">
      <div className="w-full max-w-md space-y-6">

        <h1 className="text-xl font-semibold text-center">
          Einstellungen
        </h1>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">

          <Link href="/mein-bereich/einstellungen/daten" className="block border rounded-md p-3">
            <p className="font-medium text-sm">Meine Daten</p>
          </Link>

          <Link href="/mein-bereich/einstellungen/passwort" className="block border rounded-md p-3">
            <p className="font-medium text-sm">Passwort zurücksetzen</p>
            <p className="text-xs text-gray-500">Per E-Mail</p>
          </Link>

        </div>

        <div className="bg-white border border-red-200 rounded-xl p-4">
          <Link href="/mein-bereich/einstellungen/loeschen" className="text-red-600 text-sm">
            Account löschen beantragen
          </Link>
        </div>

      </div>
    </div>
  )
}
