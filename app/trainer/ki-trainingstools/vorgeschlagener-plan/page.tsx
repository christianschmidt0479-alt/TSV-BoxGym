"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  MessageSquarePlus,
  Save,
  Shield,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"
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

// ─── Block-Karten ──────────────────────────────────────────────────────────────

function BlockCard({ block, index }: { block: TrainingPlanBlock; index: number }) {
  const [open, setOpen] = useState(index === 0)

  return (
    <div className="rounded-xl border border-[#d0dff0] bg-white">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
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

// ─── Plan-Detail-Ansicht ────────────────────────────────────────────────────────

function PlanView({
  plan,
  onNotesSaved,
}: {
  plan: AssignedPlan
  onNotesSaved: (planId: string, notes: string, modifiedPlan: string | null) => void
}) {
  const parsed = parsePlan(plan.trainer_modified_plan ?? plan.generated_plan)
  const [notes, setNotes] = useState(plan.trainer_notes ?? "")
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState("")
  const notesRef = useRef(notes)
  notesRef.current = notes

  async function handleSaveNotes() {
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/trainer/training-plans/${plan.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainer_notes: notesRef.current.trim() || null,
          trainer_modified_plan: plan.trainer_modified_plan ?? null,
        }),
      })
      if (!res.ok) throw new Error((await res.text()) || "Speichern fehlgeschlagen")
      const payload = (await res.json()) as { plan: AssignedPlan }
      onNotesSaved(plan.id, notesRef.current.trim() || "", payload.plan.trainer_modified_plan)
      setSaveSuccess(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Fehler beim Speichern")
    } finally {
      setSaving(false)
    }
  }

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
        <h3 className="text-base font-bold text-zinc-800">{parsed.title}</h3>
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

      {/* Trainer-Notizen */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <MessageSquarePlus className="h-4 w-4 text-[#154c83]" />
          <p className="text-sm font-semibold text-zinc-800">Deine Ergänzungen & Hinweise</p>
        </div>
        <p className="text-xs text-zinc-500">
          Hier kannst du kurze Notizen, organisatorische Ergänzungen oder Hinweise zur heutigen Durchführung festhalten.
        </p>
        <Textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value.slice(0, 2000))
            setSaveSuccess(false)
          }}
          placeholder="z. B. Ringaufbau heute nicht möglich – Bereich für Prellball nutzen. Warm-up etwas kürzer wegen Zeitverzug."
          className="min-h-[100px] resize-none text-sm"
          maxLength={2000}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-400">{notes.length}/2000</span>
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Gespeichert
              </span>
            )}
            {saveError && <span className="text-xs text-red-600">{saveError}</span>}
            <Button
              size="sm"
              onClick={handleSaveNotes}
              disabled={saving}
              className="bg-[#154c83] text-white hover:bg-[#123d69]"
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Speichern
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Haupt-Komponente ──────────────────────────────────────────────────────────

export default function VorgeschlagenerPlanPage() {
  const { resolved, role, accountRole, accountFirstName } = useTrainerAccess()
  const [plans, setPlans] = useState<AssignedPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null)

  const isPilot = accountFirstName.trim() === "Thomas"

  // Auth-Guard
  useEffect(() => {
    if (!resolved) return
    const isAuth = role === "trainer" || role === "admin" || accountRole === "trainer" || accountRole === "admin"
    if (!isAuth) {
      clearTrainerAccess()
    }
  }, [resolved, role, accountRole])

  // Pläne laden (nur für Thomas)
  const loadPlans = useCallback(async () => {
    if (!resolved || !isPilot) {
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError("")
    try {
      const res = await fetch("/api/trainer/training-plans", { cache: "no-store" })
      if (!res.ok) {
        setLoadError("Pläne konnten nicht geladen werden.")
        return
      }
      const payload = (await res.json()) as { plans: AssignedPlan[] }
      setPlans(payload.plans ?? [])
      if (payload.plans?.length) {
        setExpandedPlanId(payload.plans[0].id)
      }
    } catch {
      setLoadError("Verbindungsfehler beim Laden.")
    } finally {
      setLoading(false)
    }
  }, [resolved, isPilot])

  useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  function handleNotesSaved(planId: string, notes: string, modifiedPlan: string | null) {
    setPlans((prev) =>
      prev.map((p) =>
        p.id === planId ? { ...p, trainer_notes: notes || null, trainer_modified_plan: modifiedPlan } : p,
      ),
    )
  }

  if (!resolved) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Wird geladen…
      </div>
    )
  }

  // Kein Thomas: generische Infokarte, keine Funktionalität
  if (!isPilot) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-[#154c83] sm:text-2xl">Vorgeschlagener Trainingsplan</h2>
          <p className="mt-1 text-sm text-zinc-500">Dein persönlicher Trainingsplan-Vorschlag.</p>
        </div>
        <Card className="border-[#d0dff0]">
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Diese Funktion ist derzeit noch nicht verfügbar.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#154c83] sm:text-2xl">Vorgeschlagener Trainingsplan</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Dein personal vorbereiteter Trainingsplan – ergänze ihn gern mit eigenen Hinweisen.
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#d0dff0] bg-[#f0f6ff] px-3 py-1 text-xs font-medium text-[#154c83]">
          <Shield className="h-3 w-3" />
          Vorbereitet durch den Admin · KI-Basisprofil BoxGym
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Wird geladen…
        </div>
      ) : plans.length === 0 ? (
        <Card className="border-[#d0dff0]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d0dff0] bg-[#f0f6ff]">
              <ClipboardList className="h-7 w-7 text-[#154c83]" />
            </div>
            <p className="text-sm font-medium text-zinc-700">Noch kein Plan zugewiesen</p>
            <p className="max-w-xs text-xs text-zinc-500">
              Sobald der Admin dir einen Trainingsplan zuweist, erscheint er hier.
            </p>
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
                    </div>
                    <button
                      onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                      className="shrink-0 rounded-lg border border-[#d0dff0] bg-[#f4f9ff] px-2.5 py-1 text-xs font-medium text-[#154c83] hover:bg-[#ddeaf9]"
                    >
                      {isExpanded ? "Einklappen" : "Öffnen"}
                    </button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="border-t border-[#eff4fa] pt-4">
                    <PlanView plan={plan} onNotesSaved={handleNotesSaved} />
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
