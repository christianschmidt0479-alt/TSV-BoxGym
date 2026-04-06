"use client"

import Link from "next/link"
import { ArrowRight, ClipboardList, FlaskConical, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

const PILOT_FIRST_NAME = "Thomas"

export default function KiTrainingstoolsPage() {
  const { accountFirstName } = useTrainerAccess()
  const isPilot = accountFirstName.trim() === PILOT_FIRST_NAME

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#154c83] sm:text-2xl">KI Trainingstools</h2>
        <p className="mt-1 text-sm text-zinc-500">Intelligente Unterstützung für die Trainingsplanung.</p>
      </div>

      {/* Pilot-Karte: nur für Thomas sichtbar */}
      {isPilot && (
        <Card className="border-[#154c83]/20 bg-[#f0f6ff]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#154c83]">
              <Sparkles className="h-4 w-4" />
              Vorgeschlagener Trainingsplan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-zinc-700">
              Ein vom Admin vorbereiteter Trainingsplan steht für dich bereit. Du kannst ihn einsehen
              und mit eigenen Hinweisen ergänzen.
            </p>
            <Link
              href="/trainer/ki-trainingstools/vorgeschlagener-plan"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#154c83] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#123d69]"
            >
              Zum Plan
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Allgemeine Info-Karte: für alle Trainer inkl. Thomas */}
      <Card className="border-[#d0dff0]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#154c83]">
            <FlaskConical className="h-4 w-4" />
            Interne Testphase läuft
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-4 py-6 text-center sm:py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#d0dff0] bg-[#f0f6ff]">
              <ClipboardList className="h-8 w-8 text-[#154c83]" />
            </div>
            <div className="max-w-sm space-y-2">
              <p className="text-base font-semibold text-zinc-800">Trainingsplan-Generator</p>
              <p className="text-sm text-zinc-600">
                Die KI-gestützte Trainingsplanung befindet sich aktuell in der internen Erprobungsphase im
                Adminbereich.
              </p>
              <p className="text-sm text-zinc-500">
                Nach Abschluss der Testphase und Qualitätsprüfung wird das Tool für den Trainerbereich
                freigeschaltet.
              </p>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-700">
              Rollout für Trainer folgt nach interner Erprobung
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
