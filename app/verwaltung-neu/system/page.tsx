import { Suspense } from "react"
import { FerienmodusCard } from "./ferienmodus-card"

export default function SystemPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">System</h1>
      <p className="text-zinc-600 mb-6">Systemschalter und Einstellungen für das BoxGym-System.</p>
      <div className="max-w-xl mx-auto">
        <Suspense fallback={<div className="rounded-xl border border-zinc-200 bg-white p-8 text-zinc-400 text-center">Lädt…</div>}>
          <FerienmodusCard />
        </Suspense>
      </div>
    </div>
  )
}
