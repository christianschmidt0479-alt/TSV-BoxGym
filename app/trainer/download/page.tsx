import Link from "next/link"
import { redirect } from "next/navigation"
import { getUserContext } from "@/lib/getUserContext"
import { resolveUserContext } from "@/lib/resolveUserContext"
import { DOWNLOAD_DOCUMENTS } from "@/lib/downloadDocuments"

export default async function TrainerDownloadPage() {
  const resolvedContext = await resolveUserContext()
  if (!resolvedContext.isTrainer && !resolvedContext.isAdmin) {
    redirect("/trainer-zugang")
  }

  const context = await getUserContext()
  if (!context || (context.role !== "trainer" && context.role !== "admin")) {
    redirect("/mein-bereich")
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-2xl bg-[#154c83] px-4 py-4 text-base font-semibold text-white">
          Downloads
          <div className="mt-1 text-sm font-medium text-blue-100">Wettkampfunterlagen fuer Trainerbereich</div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">Wettkampf & Gewicht</h2>
              <p className="text-sm text-zinc-600">Gewichtsklassen DBV und aktuelle Wettkampfbestimmungen</p>
            </div>
            <Link
              href="/trainer"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              Zurueck
            </Link>
          </div>

          <div className="space-y-3">
            {DOWNLOAD_DOCUMENTS.map((document) => (
              <div key={document.href} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-semibold text-zinc-900">{document.title}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={document.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    PDF ansehen
                  </a>
                  <a
                    href={document.href}
                    download
                    className="rounded-lg bg-[#154c83] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#103b66]"
                  >
                    PDF herunterladen
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
