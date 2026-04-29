import Link from "next/link"
import QRCode from "react-qr-code"
import { ScannerTestClient } from "@/components/tools/ScannerTestClient"

const TEST_QR_VALUE = "TSVBOXGYM-SCANNER-TEST-001"

export default function ToolsScannerPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Scanner Test</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Diagnosemodus für QR-Scans. Kein Check-in, keine Ticketprüfung, keine Speicherung.
            </p>
          </div>
          <Link
            href="/verwaltung-neu/tools"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            Zurück zu Tools
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Fester Test-QR (Diagnose)</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Dieser QR-Code dient nur für den Scanner-Praxistest. Keine produktive Logik, keine API, keine Speicherung.
        </p>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-3">
            <QRCode value={TEST_QR_VALUE} size={220} />
          </div>

          <div className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">QR-Inhalt</div>
            <div className="mt-2 break-all rounded-lg bg-white p-3 text-sm font-semibold text-zinc-900">
              {TEST_QR_VALUE}
            </div>

            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Testanleitung</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
              <li>Seite auf dem iPhone öffnen.</li>
              <li>Kamera-Zugriff erlauben.</li>
              <li>Den Test-QR scannen.</li>
              <li>Start und Stop des Scanners prüfen.</li>
              <li>App oder Tab wechseln und danach zurückkehren.</li>
            </ol>
          </div>
        </div>
      </section>

      <ScannerTestClient mode="test" />
    </div>
  )
}
