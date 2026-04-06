"use client"

import { ClipboardList, FlaskConical } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function KiTrainingstoolsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#154c83] sm:text-2xl">KI Trainingstools</h2>
        <p className="mt-1 text-sm text-zinc-500">Intelligente Unterstützung für die Trainingsplanung.</p>
      </div>

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
