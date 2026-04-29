import Link from "next/link"
import { ScannerTestClient } from "@/components/tools/ScannerTestClient"

export default function AdminQrScannerPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">QR-Scanner</h1>
            <p className="mt-1 text-sm text-zinc-700">Handytool im Testmodus: QR-Code scannen und Ergebnis prüfen.</p>
          </div>

          <Link
            href="/verwaltung-neu/tools"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            Zu Tools
          </Link>
        </div>
      </section>

      <div className="mx-auto w-full max-w-md md:max-w-lg">
        <ScannerTestClient mode="member" mobileApp enableMemberCheckinAction />
      </div>
    </div>
  )
}
