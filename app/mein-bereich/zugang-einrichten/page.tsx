import { Suspense } from "react"
import { ZugangEinrichtenClient } from "./zugang-einrichten-client"

export default function ZugangEinrichtenPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8" />}>
      <ZugangEinrichtenClient />
    </Suspense>
  )
}
