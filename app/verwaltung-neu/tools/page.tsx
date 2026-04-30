import Link from "next/link"

export default function ToolsPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Tools</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-700">
          Dieser Bereich stellt technische Hilfswerkzeuge fuer Admins bereit. Die Werkzeuge laufen im
          Testmodus und sind bewusst von produktiven Check-in- und Ticketablaeufen getrennt.
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Scanner testen</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Kamera-Scanner fuer QR-Diagnose testen, ohne Daten zu speichern oder Prozesse auszulosen.
            </p>
          </div>

          <Link
            href="/verwaltung-neu/tools/scanner"
            className="inline-flex items-center justify-center rounded-lg bg-[#154c83] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f3f70]"
          >
            Scanner testen
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Test-QR Generator</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Erzeugt 10 lokale Test-QRs fuer Scanner-Checks. Keine echte Mitgliederanlage, keine DB-Schreibvorgaenge.
            </p>
          </div>

          <Link
            href="/verwaltung-neu/tools/test-qr"
            className="inline-flex items-center justify-center rounded-lg bg-[#154c83] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f3f70]"
          >
            Test-QRs anzeigen
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Passwort-/PIN-Migration</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Zeigt nur aggregierte Zaehlwerte zum Migrationsstand. Keine Passwoerter, keine PINs, keine Hashes.
            </p>
          </div>

          <Link
            href="/verwaltung-neu/tools/passwort-migration"
            className="inline-flex items-center justify-center rounded-lg bg-[#154c83] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f3f70]"
          >
            Auswertung oeffnen
          </Link>
        </div>
      </section>
    </div>
  )
}
