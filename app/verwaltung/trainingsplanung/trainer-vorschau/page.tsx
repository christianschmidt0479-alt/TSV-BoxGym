"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Eye,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTrainerAccess } from "@/lib/useTrainerAccess"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import type { GeneratedTrainingPlan, TrainingPlanBlock } from "@/lib/trainingPlanAi"

// ─── Typen ─────────────────────────────────────────────────────────────────────

type AssignedPlan = {
  id: string
  date: string
  group_key: string
  training_time: string | null
  training_goal: string | null
  training_focus: string | null
  duration_minutes: number | null
  generated_plan: string | null
  trainer_notes: string | null
  trainer_modified_plan: string | null
  status: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parsePlan(raw: string | null): GeneratedTrainingPlan | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null && "blocks" in parsed) {
      return parsed as GeneratedTrainingPlan
    }
    return null
  } catch {
    return null
  }
}

function formatGermanDate(iso: string) {
  const parts = iso.split("-")
  if (parts.length !== 3) return iso
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

// ─── Block-Karte (read-only) ───────────────────────────────────────────────────

function BlockCard({ block, index }: { block: TrainingPlanBlock; index: number }) {
  const [open, setOpen] = useState(index === 0)

  return (
    <div className="rounded-xl border border-[#d0dff0] bg-white">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#154c83] text-[11px] font-bold text-white">
            {index + 1}
          </span>
          <span className="text-sm font-semibold text-zinc-800">{block.name}</span>
          <span className="text-xs text-zinc-500">{block.duration_minutes} min</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-zinc-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-[#eff4fa] px-4 py-3">
          {block.objective && (
            <p className="text-sm text-zinc-700">
              <span className="font-semibold text-zinc-800">Ziel:</span> {block.objective}
            </p>
          )}
          {block.setup && (
            <p className="text-sm text-zinc-700">
              <span className="font-semibold text-zinc-800">Aufbau:</span> {block.setup}
            </p>
          )}
          {block.drills.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Übungen</p>
              <ul className="space-y-1.5">
                {block.drills.map((d, i) => (
                  <li key={i} className="text-sm text-zinc-700">
                    <span className="font-medium text-zinc-800">{d.name}</span>
                    {d.duration_hint && (
                      <span className="ml-1.5 text-xs text-zinc-400">({d.duration_hint})</span>
                    )}
                    {d.description && (
                      <span className="text-zinc-600"> — {d.description}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {block.coaching_points.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Coaching-Hinweise</p>
              <ul className="space-y-1">
                {block.coaching_points.map((cp, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm text-zinc-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#154c83]" />
                    {cp}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {block.scaling && (
            <p className="text-sm text-zinc-600">
              <span className="font-semibold text-zinc-700">Skalierung:</span> {block.scaling}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Plan-Detail (read-only) ────────────────────────────────────────────────────

function PlanViewReadOnly({ plan }: { plan: AssignedPlan }) {
  const parsed = parsePlan(plan.trainer_modified_plan ?? plan.generated_plan)
  const isModified = !!plan.trainer_modified_plan

  if (!parsed) {
    return (
      <div className="py-6 text-center text-sm text-zinc-500">
        Dieser Plan enthält noch keinen generierten Inhalt.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Titel & Zusammenfassung */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-zinc-800">{parsed.title}</h3>
          <span className="rounded-full bg-[#e8f0fb] px-2 py-0.5 text-[10px] font-semibold text-[#154c83]">
            Vorgeschlagen
          </span>
          {isModified && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Vom Trainer angepasst
            </span>
          )}
        </div>
        {parsed.summary && <p className="text-sm text-zinc-600">{parsed.summary}</p>}
      </div>

      {/* Metadaten kompakt */}
      <div className="flex flex-wrap gap-2">
        {parsed.training_goal && (
          <span className="rounded-full border border-[#d0dff0] bg-[#f4f9ff] px-2.5 py-1 text-xs font-medium text-[#154c83]">
            Ziel: {parsed.training_goal}
          </span>
        )}
        {plan.training_focus && (
          <span className="rounded-full border border-[#d0dff0] bg-[#f4f9ff] px-2.5 py-1 text-xs font-medium text-[#154c83]">
            Fokus: {plan.training_focus}
          </span>
        )}
        {plan.duration_minutes && (
          <span className="rounded-full border border-[#d0dff0] bg-[#f4f9ff] px-2.5 py-1 text-xs font-medium text-zinc-600">
            {plan.duration_minutes} min
          </span>
        )}
      </div>

      {/* Organisations-Hinweise */}
      {parsed.organization_notes && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="font-semibold">Hinweise:</span> {parsed.organization_notes}
        </div>
      )}

      {/* Equipment */}
      {parsed.equipment_needed.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Material</p>
          <div className="flex flex-wrap gap-1.5">
            {parsed.equipment_needed.map((eq, i) => (
              <span
                key={i}
                className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs text-zinc-700"
              >
                {eq}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Trainingsblöcke */}
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Trainingsblöcke ({parsed.blocks.length})
        </p>
        <div className="space-y-2">
          {parsed.blocks.map((block, i) => (
            <BlockCard key={i} block={block} index={i} />
          ))}
        </div>
      </div>

      {/* Sicherheitshinweise */}
      {parsed.safety_notes && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Sicherheit:</span> {parsed.safety_notes}
        </div>
      )}

      {/* Trainer-Notizen (nur lesend) */}
      {plan.trainer_notes && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Trainer-Notizen (Thomas)</p>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 whitespace-pre-wrap">
            {plan.trainer_notes}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Hauptseite ────────────────────────────────────────────────────────────────

export default function TrainerVorschauPage() {
  const { resolved, role, accountRole } = useTrainerAccess()
  const [plans, setPlans] = useState<AssignedPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [trainerFound, setTrainerFound] = useState<boolean | null>(null)
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null)

  const isAdmin = role === "admin" || accountRole === "admin"

  // Auth-Guard
  useEffect(() => {
    if (!resolved) return
    if (!isAdmin) {
      clearTrainerAccess()
    }
  }, [resolved, isAdmin])

  const loadPlans = useCallback(async () => {
    if (!resolved || !isAdmin) {
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError("")
    try {
      const res = await fetch("/api/admin/trainer-preview/thomas-plans", { cache: "no-store" })
      if (!res.ok) {
        setLoadError("Pläne konnten nicht geladen werden.")
        return
      }
      const payload = (await res.json()) as { plans: AssignedPlan[]; trainerFound: boolean }
      setTrainerFound(payload.trainerFound)
      setPlans(payload.plans ?? [])
      if (payload.plans?.length) {
        setExpandedPlanId(payload.plans[0].id)
      }
    } catch {
      setLoadError("Verbindungsfehler beim Laden.")
    } finally {
      setLoading(false)
    }
  }, [resolved, isAdmin])

  useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  if (!resolved) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Wird geladen…
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">
        Kein Zugriff. Nur für Admins.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Zurück-Link */}
      <div>
        <Link
          href="/verwaltung/trainingsplanung"
          className="inline-flex items-center gap-1.5 text-sm text-[#154c83] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zur Trainingsplanung
        </Link>
      </div>

      {/* Admin-Vorschau-Banner – gut sichtbar */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="text-sm text-amber-800">
          <span className="font-semibold">Admin-Vorschau: Traineransicht Thomas</span>
          <p className="mt-0.5 text-xs text-amber-700">
            Du siehst hier, was Thomas im Trainerbereich sieht – read-only. Keine Änderungen an Notizen oder Plänen möglich.
          </p>
        </div>
      </div>

      {/* Seitentitel */}
      <div>
        <h2 className="text-xl font-bold text-[#154c83] sm:text-2xl">Vorgeschlagener Trainingsplan (Thomas)</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Traineransicht für Thomas – so wie er sie in seinem KI-Trainerbereich sieht.
        </p>
      </div>

      {/* Fehler */}
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Laden */}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Wird geladen…
        </div>
      ) : trainerFound === false ? (
        <Card className="border-[#d0dff0]">
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Trainer-Account für Thomas nicht gefunden.
          </CardContent>
        </Card>
      ) : plans.length === 0 ? (
        <Card className="border-[#d0dff0]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d0dff0] bg-[#f0f6ff]">
              <ClipboardList className="h-7 w-7 text-[#154c83]" />
            </div>
            <p className="text-sm font-medium text-zinc-700">Kein Plan Thomas zugewiesen</p>
            <p className="max-w-xs text-xs text-zinc-500">
              Weise Thomas einen Plan in der Trainingsplanung zu, damit er hier erscheint.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-1">
              <Link href="/verwaltung/trainingsplanung">Zur Trainingsplanung</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => {
            const isExpanded = expandedPlanId === plan.id
            return (
              <Card key={plan.id} className="border-[#d0dff0]">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#154c83]">
                        <BookOpen className="h-4 w-4" />
                        {plan.group_key}
                        {plan.training_time && (
                          <span className="font-normal text-zinc-500">· {plan.training_time}</span>
                        )}
                      </CardTitle>
                      <p className="text-xs text-zinc-500">
                        {formatGermanDate(plan.date)}
                        {plan.training_goal && ` · ${plan.training_goal}`}
                      </p>
                      {plan.trainer_modified_plan && (
                        <span className="mt-0.5 inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Vom Trainer angepasst
                        </span>
                      )}
                      {plan.trainer_notes && (
                        <span className="mt-0.5 inline-block rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          Trainer-Notizen vorhanden
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                      className="shrink-0 rounded-lg border border-[#d0dff0] bg-[#f4f9ff] px-2.5 py-1 text-xs font-medium text-[#154c83] hover:bg-[#ddeaf9]"
                      type="button"
                    >
                      {isExpanded ? "Einklappen" : "Öffnen"}
                    </button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="border-t border-[#eff4fa] pt-4">
                    <PlanViewReadOnly plan={plan} />
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
