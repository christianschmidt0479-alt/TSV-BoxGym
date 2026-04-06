"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  BookMarked,
  Brain,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Eye,
  FlaskConical,
  GitBranch,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Star,
  UserCheck,
  Users,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { getTodayIsoDateInBerlin } from "@/lib/dateFormat"
import type { GeneratedTrainingPlan, TrainingPlanBlock, TrainingPlanDrill } from "@/lib/trainingPlanAi"
import { TRAINING_GROUPS } from "@/lib/trainingGroups"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

// ─── Typen ────────────────────────────────────────────────────────────────────

type TrainingPlan = {
  id: string
  date: string
  group_key: string
  training_time: string | null
  age_group: string | null
  performance_level: string | null
  participant_count: number | null
  trainer_count: number | null
  duration_minutes: number | null
  training_goal: string | null
  training_focus: string | null
  training_mode: string | null
  sparring_allowed: boolean
  ring_available: boolean
  ai_context: string | null
  plan_type: "single" | "combo" | "followup"
  secondary_group_key: string | null
  is_holiday_combined: boolean
  based_on_plan_id: string | null
  generated_plan: string | null
  status: string
  is_template: boolean
  template_name: string | null
  template_quality: string | null
  assigned_trainer_id: string | null
  created_at: string
}

type PlanType = "single" | "combo" | "followup"

type FormValues = {
  date: string
  group_key: string
  training_time: string
  age_group: string
  performance_level: string
  participant_count: string
  trainer_count: string
  duration_minutes: string
  training_goal: string
  training_focus: string
  training_mode: string
  sparring_allowed: boolean
  ring_available: boolean
  ai_context: string
  plan_type: PlanType
  secondary_group_key: string
  is_holiday_combined: boolean
  based_on_plan_id: string
}

type PlanContext = {
  group_key: string | null
  date: string | null
  training_time: string | null
  age_group: string | null
  performance_level: string | null
  participant_count: number | null
  trainer_count: number | null
  duration_minutes: number | null
  training_goal: string | null
  training_focus: string | null
  training_mode: string | null
  sparring_allowed: boolean
  ring_available: boolean
  plan_type: PlanType | null
  secondary_group_key: string | null
  is_holiday_combined: boolean
  based_on_plan_id: string | null
}

// ─── Konstanten ───────────────────────────────────────────────────────────────

const AGE_GROUP_OPTIONS = [
  "Kinder (6–9 Jahre)",
  "Jugend (10–14 Jahre)",
  "Jugend (15–18 Jahre)",
  "Erwachsene (Ü18)",
  "Gemischt",
]

const PERFORMANCE_LEVEL_OPTIONS = [
  "Anfänger",
  "Fortgeschritten",
  "Leistung",
  "Gemischt",
]

const TRAINING_FOCUS_OPTIONS = [
  "Führhand",
  "Distanz",
  "Deckung",
  "Konter",
  "Kombinationen",
  "Beinarbeit",
  "Druckverhalten",
  "Reaktion",
  "Grundschule",
  "Wettkampfvorbereitung",
]

const TRAINING_MODE_OPTIONS = [
  "Grundschule",
  "Technikfokus",
  "Anwendung",
  "Wettkampfnah",
  "Regeneration / locker",
]

// Standard-Vorbelgung beim Auswählen einer Trainingsgruppe
const GROUP_DEFAULTS: Record<string, Partial<FormValues>> = {
  "Boxzwerge": { age_group: "Kinder (6–9 Jahre)", performance_level: "Anfänger", participant_count: "12", duration_minutes: "60" },
  "Basic 10 - 14 Jahre": { age_group: "Jugend (10–14 Jahre)", performance_level: "Anfänger", participant_count: "15", duration_minutes: "90" },
  "Basic 15 - 18 Jahre": { age_group: "Jugend (15–18 Jahre)", performance_level: "Anfänger", participant_count: "12", duration_minutes: "90" },
  "Basic Ü18": { age_group: "Erwachsene (Ü18)", performance_level: "Fortgeschritten", participant_count: "12", duration_minutes: "90" },
  "L-Gruppe": { age_group: "Erwachsene (Ü18)", performance_level: "Leistung", participant_count: "8", duration_minutes: "90", sparring_allowed: true, ring_available: true },
}

type FilterKey = "all" | "draft" | "ai_generated" | "reviewed" | "template"

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "draft", label: "Entwürfe" },
  { key: "ai_generated", label: "KI generiert" },
  { key: "reviewed", label: "Geprüft" },
  { key: "template", label: "Vorlagen" },
]

type TestScenario = {
  label: string
  description: string
  values: Partial<FormValues>
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    label: "Boxzwerge – Kleingruppe",
    description: "8 Kinder, 1 Trainer, 60 min, kein Sparring",
    values: {
      group_key: "Boxzwerge",
      age_group: "Kinder (6–9 Jahre)",
      performance_level: "Anfänger",
      participant_count: "8",
      trainer_count: "1",
      duration_minutes: "60",
      sparring_allowed: false,
      ring_available: false,
      training_goal: "Koordination, Freude an Bewegung, erste Boxgrundhaltung",
      ai_context:
        "Kinder 6–9 Jahre. Kurze Aufmerksamkeitsspanne. Spielerische Elemente wichtig. Kein Vollkontakt. Halle mit Sandsäcken und Springseilen.",
    },
  },
  {
    label: "Basic Jugend – Große Gruppe",
    description: "18 Jugendliche, 2 Trainer, 90 min, Stationsbetrieb",
    values: {
      group_key: "Basic 10 - 14 Jahre",
      age_group: "Jugend (10–14 Jahre)",
      performance_level: "Anfänger",
      participant_count: "18",
      trainer_count: "2",
      duration_minutes: "90",
      sparring_allowed: false,
      ring_available: false,
      training_goal: "Grundtechnik Jab-Cross, Stationsbetrieb für große Gruppe",
      ai_context:
        "Sehr große Gruppe. 2 Trainer. Stationsaufbau notwendig. Mehrheitlich Anfänger. 4–5 Stationen mit Pratzen, Sandsäcken, Seilen. Klare Signale für Stationswechsel.",
    },
  },
  {
    label: "L-Gruppe – Leistungstraining",
    description: "10 Sportler, 2 Trainer, 90 min, Sparring möglich",
    values: {
      group_key: "L-Gruppe",
      age_group: "Erwachsene (Ü18)",
      performance_level: "Leistung",
      participant_count: "10",
      trainer_count: "2",
      duration_minutes: "90",
      sparring_allowed: true,
      ring_available: true,
      training_goal: "Kondition + situatives Sparring, Kombinations-Drills",
      ai_context:
        "Leistungsgruppe, alle lizenziert oder auf dem Weg. Ring für 2–3 Paare. Fokus Kampfvorbereitung. High-intensity intervals, technisches Sparring.",
    },
  },
  {
    label: "Basic Ü18 – Technikschwerpunkt",
    description: "12 Erwachsene, 1 Trainer, 90 min, kein Sparring",
    values: {
      group_key: "Basic Ü18",
      age_group: "Erwachsene (Ü18)",
      performance_level: "Fortgeschritten",
      participant_count: "12",
      trainer_count: "1",
      duration_minutes: "90",
      sparring_allowed: false,
      ring_available: true,
      training_goal: "Kombinations-Technik, defensive Bewegungsarbeit",
      ai_context:
        "Fortgeschrittene Erwachsene, gemischte Vorerfahrung. Ring zum Schattenboxen nutzbar. Kein Sparring. Fokus auf saubere Technik und Kombinationsfluss.",
    },
  },
]

function emptyForm(today: string): FormValues {
  return {
    date: today,
    group_key: "",
    training_time: "",
    age_group: "",
    performance_level: "",
    participant_count: "",
    trainer_count: "",
    duration_minutes: "90",
    training_goal: "",
    training_focus: "",
    training_mode: "",
    sparring_allowed: false,
    ring_available: false,
    ai_context: "",
    plan_type: "single",
    secondary_group_key: "",
    is_holiday_combined: false,
    based_on_plan_id: "",
  }
}

function formToPlanContext(form: FormValues): PlanContext {
  return {
    group_key: form.group_key || null,
    date: form.date || null,
    training_time: form.training_time || null,
    age_group: form.age_group || null,
    performance_level: form.performance_level || null,
    participant_count: form.participant_count ? Number(form.participant_count) : null,
    trainer_count: form.trainer_count ? Number(form.trainer_count) : null,
    duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
    training_goal: form.training_goal || null,
    training_focus: form.training_focus || null,
    training_mode: form.training_mode || null,
    sparring_allowed: form.sparring_allowed,
    ring_available: form.ring_available,
    plan_type: form.plan_type || null,
    secondary_group_key: form.secondary_group_key || null,
    is_holiday_combined: form.is_holiday_combined,
    based_on_plan_id: form.based_on_plan_id || null,
  }
}

function planToPlanContext(plan: TrainingPlan): PlanContext {
  return {
    group_key: plan.group_key,
    date: plan.date,
    training_time: plan.training_time,
    age_group: plan.age_group,
    performance_level: plan.performance_level,
    participant_count: plan.participant_count,
    trainer_count: plan.trainer_count,
    duration_minutes: plan.duration_minutes,
    training_goal: plan.training_goal,
    training_focus: plan.training_focus,
    training_mode: plan.training_mode,
    sparring_allowed: plan.sparring_allowed,
    ring_available: plan.ring_available,
    plan_type: plan.plan_type ?? "single",
    secondary_group_key: plan.secondary_group_key ?? null,
    is_holiday_combined: plan.is_holiday_combined ?? false,
    based_on_plan_id: plan.based_on_plan_id ?? null,
  }
}

// ─── Hilfsformat ──────────────────────────────────────────────────────────────

function formatGermanDate(isoDate: string) {
  if (!isoDate) return "—"
  const parts = isoDate.split("-")
  if (parts.length !== 3) return isoDate
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function deepClonePlan(plan: GeneratedTrainingPlan): GeneratedTrainingPlan {
  return JSON.parse(JSON.stringify(plan)) as GeneratedTrainingPlan
}

function parseStoredPlan(raw: string | null): GeneratedTrainingPlan | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.title !== "string") return null
    if (!Array.isArray(obj.blocks)) return null
    return obj as unknown as GeneratedTrainingPlan
  } catch {
    return null
  }
}

// ─── Vorschau ─────────────────────────────────────────────────────────────────

function PlanPreview({ values }: { values: FormValues }) {
  const hasContent =
    values.group_key || values.training_goal || values.age_group || values.performance_level || values.ai_context

  if (!hasContent) return null

  return (
    <Card className="border-[#d0dff0] bg-[#f7fbff]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#154c83]">
          <ClipboardList className="h-4 w-4" />
          Vorschau Eingabefelder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Rahmeninfos */}
        <div className="grid gap-1">
          <p className="font-medium text-zinc-700">Rahmeninfos</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-zinc-600 sm:grid-cols-3">
            {values.date && (
              <span>
                <span className="font-medium">Datum:</span> {formatGermanDate(values.date)}
                {values.training_time && (
                  <span className="ml-1 text-zinc-500">{values.training_time} Uhr</span>
                )}
              </span>
            )}
            {values.group_key && (
              <span>
                <span className="font-medium">Gruppe:</span> {values.group_key}
              </span>
            )}
            {values.age_group && (
              <span>
                <span className="font-medium">Altersgruppe:</span> {values.age_group}
              </span>
            )}
            {values.performance_level && (
              <span>
                <span className="font-medium">Niveau:</span> {values.performance_level}
              </span>
            )}
            {values.participant_count && (
              <span>
                <span className="font-medium">Teilnehmer:</span> {values.participant_count}
              </span>
            )}
            {values.trainer_count && (
              <span>
                <span className="font-medium">Trainer:</span> {values.trainer_count}
              </span>
            )}
            {values.duration_minutes && (
              <span>
                <span className="font-medium">Dauer:</span> {values.duration_minutes} min
              </span>
            )}
            <span>
              <span className="font-medium">Sparring:</span>{" "}
              <span className={values.sparring_allowed ? "text-green-700" : "text-zinc-500"}>
                {values.sparring_allowed ? "Erlaubt" : "Nicht geplant"}
              </span>
            </span>
            <span>
              <span className="font-medium">Ring:</span>{" "}
              <span className={values.ring_available ? "text-green-700" : "text-zinc-500"}>
                {values.ring_available ? "Verfügbar" : "Nicht verfügbar"}
              </span>
            </span>
            {values.training_mode && (
              <span>
                <span className="font-medium">Modus:</span> {values.training_mode}
              </span>
            )}
            {values.training_focus && (
              <span>
                <span className="font-medium">Fokus:</span> {values.training_focus}
              </span>
            )}
          </div>
        </div>

        {/* Ziel */}
        {values.training_goal && (
          <div className="grid gap-1">
            <p className="font-medium text-zinc-700">Trainingsziel / Fokus</p>
            <p className="whitespace-pre-wrap text-zinc-600">{values.training_goal}</p>
          </div>
        )}

        {/* KI-Kontext */}
        {values.ai_context && (
          <div className="grid gap-1">
            <p className="font-medium text-zinc-700">Zusatzinfos für spätere KI-Generierung</p>
            <p className="whitespace-pre-wrap text-zinc-600">{values.ai_context}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Block-Editor ────────────────────────────────────────────────────────────

type BlockEditorProps = {
  block: TrainingPlanBlock
  index: number
  onChange: (updated: TrainingPlanBlock) => void
}

function BlockEditor({ block, index, onChange }: BlockEditorProps) {
  function setBlockField<K extends keyof TrainingPlanBlock>(key: K, value: TrainingPlanBlock[K]) {
    onChange({ ...block, [key]: value })
  }

  function setDrill(di: number, field: keyof TrainingPlanDrill, value: string) {
    const next = block.drills.map((d, i) => (i === di ? { ...d, [field]: value } : d))
    onChange({ ...block, drills: next })
  }

  function addDrill() {
    onChange({ ...block, drills: [...block.drills, { name: "", description: "", duration_hint: "" }] })
  }

  function removeDrill(di: number) {
    onChange({ ...block, drills: block.drills.filter((_, i) => i !== di) })
  }

  return (
    <div className="rounded-xl border border-[#c5d8f0] bg-[#f7fbff] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#154c83] text-xs font-bold text-white">
          {index + 1}
        </span>
        <Input
          value={block.name}
          onChange={(e) => setBlockField("name", e.target.value)}
          placeholder="Blockname"
          className="font-semibold"
        />
        <Input
          type="number"
          min={1}
          max={120}
          value={block.duration_minutes}
          onChange={(e) => setBlockField("duration_minutes", Number(e.target.value))}
          className="w-20 shrink-0 text-center"
          placeholder="min"
        />
        <span className="shrink-0 text-xs text-zinc-500">min</span>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium text-zinc-600">Ziel dieses Blocks</Label>
          <Input
            value={block.objective}
            onChange={(e) => setBlockField("objective", e.target.value)}
            placeholder="Ziel / Schwerpunkt…"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-zinc-600">Aufbau / Setup</Label>
          <Textarea
            value={block.setup}
            onChange={(e) => setBlockField("setup", e.target.value)}
            placeholder="Aufstellung, Stationen, Material…"
            className="min-h-[60px]"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-zinc-600">Übungen</Label>
            <button type="button" onClick={addDrill} className="text-xs text-[#154c83] hover:underline">
              + Übung hinzufügen
            </button>
          </div>
          <div className="space-y-2">
            {block.drills.map((drill, di) => (
              <div key={di} className="flex items-start gap-2">
                <div className="grid flex-1 gap-1.5 sm:grid-cols-3">
                  <Input
                    value={drill.name}
                    onChange={(e) => setDrill(di, "name", e.target.value)}
                    placeholder="Name"
                    className="text-sm"
                  />
                  <Input
                    value={drill.description}
                    onChange={(e) => setDrill(di, "description", e.target.value)}
                    placeholder="Beschreibung"
                    className="text-sm"
                  />
                  <Input
                    value={drill.duration_hint ?? ""}
                    onChange={(e) => setDrill(di, "duration_hint", e.target.value)}
                    placeholder="Dauer (z.B. 3 min)"
                    className="text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeDrill(di)}
                  className="mt-1 text-zinc-400 hover:text-red-500"
                  aria-label="Übung entfernen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-zinc-600">Coaching-Cues (eine pro Zeile)</Label>
          <Textarea
            value={block.coaching_points.join("\n")}
            onChange={(e) =>
              setBlockField(
                "coaching_points",
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder={"Cue 1\nCue 2\n…"}
            className="min-h-[60px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-zinc-600">Skalierung</Label>
          <Input
            value={block.scaling}
            onChange={(e) => setBlockField("scaling", e.target.value)}
            placeholder="Wie einfacher / schwerer machen…"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Block-Anzeige (readonly) ─────────────────────────────────────────────────

function TrainingBlockCard({ block, index }: { block: TrainingPlanBlock; index: number }) {
  return (
    <div className="rounded-xl border border-[#d0dff0] bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#154c83] text-xs font-bold text-white">
            {index + 1}
          </span>
          <h4 className="font-semibold text-zinc-800">{block.name}</h4>
        </div>
        <Badge className="shrink-0 bg-[#eef4fb] text-[#154c83] hover:bg-[#ddeaf9]">
          {block.duration_minutes} min
        </Badge>
      </div>

      <p className="mb-3 text-sm text-zinc-600">
        <span className="font-medium">Ziel:</span> {block.objective}
      </p>

      {block.setup && (
        <p className="mb-3 text-sm text-zinc-600">
          <span className="font-medium">Aufbau:</span> {block.setup}
        </p>
      )}

      {block.drills.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Übungen</p>
          <ul className="space-y-1.5">
            {block.drills.map((drill, di) => (
              <li key={di} className="flex gap-2 text-sm">
                <span className="mt-0.5 shrink-0 text-[#154c83]">▸</span>
                <span>
                  <span className="font-medium text-zinc-800">{drill.name}</span>
                  {drill.description ? <span className="text-zinc-600"> – {drill.description}</span> : null}
                  {drill.duration_hint ? (
                    <span className="ml-1 text-xs text-zinc-400">({drill.duration_hint})</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {block.coaching_points.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Coaching-Cues</p>
          <ul className="flex flex-wrap gap-1.5">
            {block.coaching_points.map((cue, ci) => (
              <li
                key={ci}
                className="rounded-full border border-[#d0dff0] bg-[#f0f6ff] px-2.5 py-0.5 text-xs text-zinc-700"
              >
                {cue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {block.scaling && (
        <p className="text-xs text-zinc-500">
          <span className="font-medium">Skalierung:</span> {block.scaling}
        </p>
      )}
    </div>
  )
}

// ─── Plan-Kontext-Block ───────────────────────────────────────────────────────

function PlanContextBlock({ ctx }: { ctx: PlanContext }) {
  type Item = { label: string; value: string; accent?: boolean; special?: string }
  const items: Item[] = []

  // Planart-Badge oben
  const planTypeLabel =
    ctx.plan_type === "combo"
      ? ctx.is_holiday_combined
        ? "Kombiplan · Ferienbetrieb"
        : "Kombiplan"
      : ctx.plan_type === "followup"
        ? "Folgeplan"
        : null

  if (ctx.group_key) {
    const einheit = ctx.date
      ? `${formatGermanDate(ctx.date)}${ctx.training_time ? ` · ${ctx.training_time} Uhr` : ""}`
      : null
    items.push({ label: "Gruppe", value: ctx.group_key })
    if (ctx.secondary_group_key) items.push({ label: "Zusatzgruppe", value: ctx.secondary_group_key, special: "combo" })
    if (einheit) items.push({ label: "Einheit", value: einheit })
  }
  if (ctx.age_group) items.push({ label: "Alter", value: ctx.age_group })
  if (ctx.performance_level) items.push({ label: "Niveau", value: ctx.performance_level })
  if (ctx.participant_count != null) items.push({ label: "Teilnehmer", value: `${ctx.participant_count}` })
  if (ctx.trainer_count != null) items.push({ label: "Trainer", value: `${ctx.trainer_count}` })
  if (ctx.duration_minutes != null) items.push({ label: "Dauer", value: `${ctx.duration_minutes} min` })
  if (ctx.training_mode) items.push({ label: "Modus", value: ctx.training_mode, accent: true })
  if (ctx.training_focus) items.push({ label: "Fokus", value: ctx.training_focus, accent: true })
  if (ctx.training_goal) items.push({ label: "Ziel", value: ctx.training_goal })
  items.push({ label: "Sparring", value: ctx.sparring_allowed ? "Erlaubt" : "Nicht geplant" })
  items.push({ label: "Ring", value: ctx.ring_available ? "Verfügbar" : "Nicht verfügbar" })

  if (items.length === 0 && !planTypeLabel) return null

  return (
    <div className="rounded-xl border border-[#c5d8f0] bg-[#eef5fc] px-3.5 py-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#3d6ea0]">
          <ClipboardList className="h-3.5 w-3.5" />
          Plan basiert auf
        </p>
        {planTypeLabel && (
          <span
            className={
              ctx.plan_type === "combo"
                ? "rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700"
                : "rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700"
            }
          >
            {ctx.plan_type === "combo" ? <Layers className="mr-1 inline h-3 w-3" /> : <GitBranch className="mr-1 inline h-3 w-3" />}
            {planTypeLabel}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {items.map(({ label, value, accent, special }) => (
          <span key={label} className="text-xs leading-snug text-zinc-700">
            <span className="font-medium text-zinc-400">{label}:</span>{" "}
            <span
              className={
                accent
                  ? "font-semibold text-[#154c83]"
                  : special === "combo"
                    ? "font-semibold text-teal-700"
                    : ""
              }
            >
              {value}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Bearbeitbarer Plan (View + Edit) ─────────────────────────────────────────

type EditablePlanViewProps = {
  plan: GeneratedTrainingPlan
  planId: string | null
  usedFallback: boolean
  generationError: string | null
  planContext?: PlanContext | null
  onDismiss: () => void
  onPlanSaved: (updatedPlan: TrainingPlan) => void
}

function EditablePlanView({
  plan,
  planId,
  usedFallback,
  generationError,
  planContext,
  onDismiss,
  onPlanSaved,
}: EditablePlanViewProps) {
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<GeneratedTrainingPlan>(() => deepClonePlan(plan))
  const [isTemplate, setIsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateQuality, setTemplateQuality] = useState<"tested" | "recommended" | "standard" | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    setDraft(deepClonePlan(plan))
    setEditMode(false)
    setSaveSuccess(false)
    setSaveError("")
  }, [plan])

  function setDraftField<K extends keyof GeneratedTrainingPlan>(key: K, value: GeneratedTrainingPlan[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function setBlock(bi: number, updated: TrainingPlanBlock) {
    const blocks = draft.blocks.map((b, i) => (i === bi ? updated : b))
    setDraft((prev) => ({ ...prev, blocks }))
  }

  function addBlock() {
    const newBlock: TrainingPlanBlock = {
      name: "Neuer Block",
      duration_minutes: 15,
      objective: "",
      setup: "",
      drills: [],
      coaching_points: [],
      scaling: "",
    }
    setDraft((prev) => ({ ...prev, blocks: [...prev.blocks, newBlock] }))
  }

  function removeBlock(bi: number) {
    setDraft((prev) => ({ ...prev, blocks: prev.blocks.filter((_, i) => i !== bi) }))
  }

  async function handleSaveReviewed() {
    if (!planId) {
      setSaveError("Kein gespeicherter Entwurf verknüpft. Bitte zunächst als Entwurf speichern.")
      return
    }
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/admin/training-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generated_plan: JSON.stringify(draft),
          status: "reviewed",
          is_template: isTemplate,
          template_name: isTemplate && templateName.trim() ? templateName.trim() : null,
          template_quality: isTemplate ? templateQuality : null,
          training_focus: planContext?.training_focus ?? null,
          training_mode: planContext?.training_mode ?? null,
          training_time: planContext?.training_time ?? undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.text()) || "Speichern fehlgeschlagen.")
      const payload = (await res.json()) as { plan: TrainingPlan }
      onPlanSaved(payload.plan)
      setSaveSuccess(true)
      setEditMode(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unbekannter Fehler.")
    } finally {
      setSaving(false)
    }
  }

  const displayPlan = editMode ? draft : plan

  return (
    <Card className="border-[#b8d4f2] bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#154c83]" />
            <div>
              <CardTitle className="text-base font-bold text-[#154c83]">{displayPlan.title}</CardTitle>
              <p className="mt-0.5 text-xs text-zinc-500">
                {editMode ? "Bearbeitungsmodus" : planContext?.training_time ? `${planContext.training_time} Uhr • KI-generierter Trainingsplan` : "KI-generierter Trainingsplan"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                <CheckCircle className="h-3.5 w-3.5" />
                Gespeichert
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditMode((v) => !v)
                setSaveError("")
                setSaveSuccess(false)
              }}
              className="border-[#cdd9e6] text-[#154c83] hover:bg-[#f0f6ff]"
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {editMode ? "Bearbeitung beenden" : "Bearbeiten"}
            </Button>
            <button
              onClick={onDismiss}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              aria-label="Plan ausblenden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {usedFallback && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Hinweis:</strong> Kein OpenAI-Zugang aktiv – Basis-Vorlageplan erstellt.
              {generationError ? ` (${generationError})` : ""}
            </span>
          </div>
        )}

        {/* ── Metafelder ── */}
        {editMode ? (
          <div className="space-y-4 rounded-xl border border-[#d0dff0] bg-[#f7fbff] p-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Titel</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraftField("title", e.target.value)}
                placeholder="Plantitel"
                className="font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Kurzüberblick</Label>
              <Textarea
                value={draft.summary}
                onChange={(e) => setDraftField("summary", e.target.value)}
                className="min-h-[70px]"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Trainingsziel</Label>
                <Textarea
                  value={draft.training_goal}
                  onChange={(e) => setDraftField("training_goal", e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Zielgruppe</Label>
                <Input
                  value={draft.target_group}
                  onChange={(e) => setDraftField("target_group", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Organisationshinweise
              </Label>
              <Textarea
                value={draft.organization_notes}
                onChange={(e) => setDraftField("organization_notes", e.target.value)}
                className="min-h-[60px]"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Benötigtes Material (eine Zeile pro Item)
                </Label>
                <Textarea
                  value={draft.equipment_needed.join("\n")}
                  onChange={(e) =>
                    setDraftField(
                      "equipment_needed",
                      e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                  className="min-h-[80px]"
                  placeholder={"Handschuhe\nBandagen\nPratzen"}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Sicherheit / Hinweise
                </Label>
                <Textarea
                  value={draft.safety_notes}
                  onChange={(e) => setDraftField("safety_notes", e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#d0dff0] bg-[#f7fbff] p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Zielgruppe</p>
                <p className="mt-0.5 text-sm text-zinc-800">{displayPlan.target_group}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Trainingsziel</p>
                <p className="mt-0.5 text-sm text-zinc-800">{displayPlan.training_goal}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Kurzüberblick</p>
              <p className="mt-0.5 text-sm text-zinc-700">{displayPlan.summary}</p>
            </div>
          </div>
        )}

        {!editMode && displayPlan.organization_notes && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Organisationshinweise</p>
            <p className="text-sm text-zinc-700">{displayPlan.organization_notes}</p>
          </div>
        )}

        {!editMode && planContext && <PlanContextBlock ctx={planContext} />}

        {/* ── Trainingsblöcke ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Trainingsblöcke ({displayPlan.blocks.length})
            </p>
            {editMode && (
              <button type="button" onClick={addBlock} className="text-xs text-[#154c83] hover:underline">
                + Block hinzufügen
              </button>
            )}
          </div>
          <div className="space-y-3">
            {displayPlan.blocks.map((block, i) =>
              editMode ? (
                <div key={i} className="relative">
                  <BlockEditor block={block} index={i} onChange={(updated) => setBlock(i, updated)} />
                  <button
                    type="button"
                    onClick={() => removeBlock(i)}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200"
                    aria-label="Block entfernen"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <TrainingBlockCard key={i} block={block} index={i} />
              ),
            )}
          </div>
        </div>

        {/* ── Material + Sicherheit (view only) ── */}
        {!editMode && (
          <div className="grid gap-4 sm:grid-cols-2">
            {displayPlan.equipment_needed.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Benötigtes Material
                </p>
                <ul className="space-y-1">
                  {displayPlan.equipment_needed.map((item, i) => (
                    <li key={i} className="flex gap-1.5 text-sm text-zinc-700">
                      <span className="text-[#154c83]">·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {displayPlan.safety_notes && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Sicherheit / Hinweise
                </p>
                <p className="text-sm text-zinc-700">{displayPlan.safety_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Vorlagen-Flag + Speichern (edit mode) ── */}
        {editMode && (
          <div className="space-y-4 rounded-xl border border-[#dce8f7] bg-[#f8faff] p-4">
            <div className="flex flex-wrap items-start gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isTemplate}
                  onChange={(e) => setIsTemplate(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 accent-[#154c83]"
                />
                <Star className="h-3.5 w-3.5 text-amber-500" />
                <span className="font-medium text-zinc-700">Als Vorlage speichern</span>
              </label>
              {isTemplate && (
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Vorlagenname (z. B. Boxzwerge Standard)"
                  className="min-w-[200px] flex-1"
                />
              )}
            </div>
            {isTemplate && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Qualitätsstatus der Vorlage</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["tested", "recommended", "standard"] as const).map((q) => {
                    const labels = { tested: "Getestet", recommended: "Empfohlen", standard: "Standard" }
                    const activeClass = {
                      tested: "border-emerald-300 bg-emerald-50 text-emerald-700",
                      recommended: "border-amber-300 bg-amber-50 text-amber-700",
                      standard: "border-blue-300 bg-blue-50 text-blue-700",
                    }
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setTemplateQuality(templateQuality === q ? null : q)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                          templateQuality === q
                            ? activeClass[q]
                            : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400"
                        }`}
                      >
                        {labels[q]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {saveError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void handleSaveReviewed()}
                disabled={saving || !planId}
                className="bg-[#154c83] text-white hover:bg-[#1a5e9f]"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird gespeichert…
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {isTemplate ? "Als geprüfte Vorlage speichern" : "Als geprüften Plan speichern"}
                  </>
                )}
              </Button>
              {!planId && (
                <p className="self-center text-xs text-zinc-500">
                  Bitte erst als Entwurf speichern, um den Plan zu sichern.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Trainer-Zuweisung (Admin-Panel) ─────────────────────────────────────────

type TrainerOption = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

function TrainerAssignSection({
  planId,
  currentAssignedTrainerId,
  onAssigned,
}: {
  planId: string
  currentAssignedTrainerId: string | null
  onAssigned: (trainerId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [trainers, setTrainers] = useState<TrainerOption[]>([])
  const [loadingTrainers, setLoadingTrainers] = useState(false)
  const [selected, setSelected] = useState<string>(currentAssignedTrainerId ?? "__none__")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Trainer laden wenn Panel geöffnet wird
  useEffect(() => {
    if (!open || trainers.length > 0) return
    setLoadingTrainers(true)
    fetch("/api/admin/person-roles", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { trainers?: TrainerOption[] } | null) => {
        setTrainers(data?.trainers ?? [])
      })
      .catch(() => {})
      .finally(() => setLoadingTrainers(false))
  }, [open, trainers.length])

  async function handleSave() {
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)
    const trainerId = selected === "__none__" ? null : selected
    try {
      const res = await fetch(`/api/admin/training-plans/${planId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainer_id: trainerId }),
      })
      if (!res.ok) throw new Error((await res.text()) || "Speichern fehlgeschlagen")
      onAssigned(trainerId)
      setSaveSuccess(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Fehler beim Speichern")
    } finally {
      setSaving(false)
    }
  }

  const assignedTrainer = trainers.find((t) => t.id === currentAssignedTrainerId)
  const assignedLabel = assignedTrainer
    ? `${assignedTrainer.first_name ?? ""} ${assignedTrainer.last_name ?? ""}`.trim() || assignedTrainer.email || "—"
    : null

  return (
    <Card className="border-[#d0dff0]">
      <CardHeader className="pb-2">
        <button
          className="flex w-full items-center justify-between gap-2"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#154c83]">
            <UserCheck className="h-4 w-4" />
            Trainer-Zuweisung
            {assignedLabel && (
              <span className="ml-1 rounded-full bg-[#e8f0fb] px-2 py-0.5 text-xs font-normal text-[#154c83]">
                {assignedLabel}
              </span>
            )}
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          )}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3 border-t border-[#eff4fa] pt-4">
          <p className="text-xs text-zinc-500">
            Weise diesen Plan einem Trainer zu, damit er ihn in seinem Bereich als Vorschlag sieht (Pilot: Thomas).
          </p>
          {loadingTrainers ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Trainer werden geladen…
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Trainer wählen…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Kein Trainer —</SelectItem>
                  {trainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {`${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() || t.email || t.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving || selected === (currentAssignedTrainerId ?? "__none__")}
                className="bg-[#154c83] text-white hover:bg-[#123d69]"
              >
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Zuweisen
              </Button>
              {saveSuccess && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Gespeichert
                </span>
              )}
              {saveError && <span className="text-xs text-red-600">{saveError}</span>}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ─── Trainer-KI-Profil-Sektion ──────────────────────────────────────────────

type TrainerProfileData = {
  style: string
  strengths: string
  focus: string
  notes: string
  trainer_license: string
  trainer_experience_level: string
}

function TrainerProfileSection({ trainerId }: { trainerId: string }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<TrainerProfileData>({ style: "", strengths: "", focus: "", notes: "", trainer_license: "", trainer_experience_level: "" })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState("")

  useEffect(() => {
    if (!open || loaded) return
    fetch(`/api/admin/trainer-profiles/${trainerId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (res: {
          profile?: {
            style?: string | null
            strengths?: string | null
            focus?: string | null
            notes?: string | null
            trainer_license?: string | null
            trainer_experience_level?: string | null
          } | null
        } | null) => {
          if (res?.profile) {
            setData({
              style: res.profile.style ?? "",
              strengths: res.profile.strengths ?? "",
              focus: res.profile.focus ?? "",
              notes: res.profile.notes ?? "",
              trainer_license: res.profile.trainer_license ?? "",
              trainer_experience_level: res.profile.trainer_experience_level ?? "",
            })
          }
          setLoaded(true)
        },
      )
      .catch(() => setLoaded(true))
  }, [open, loaded, trainerId])

  async function handleSave() {
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/admin/trainer-profiles/${trainerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style: data.style.trim() || null,
          strengths: data.strengths.trim() || null,
          focus: data.focus.trim() || null,
          notes: data.notes.trim() || null,
          trainer_license: data.trainer_license.trim() || null,
          trainer_experience_level: data.trainer_experience_level.trim() || null,
        }),
      })
      if (!res.ok) throw new Error((await res.text()) || "Fehler beim Speichern")
      setSaveSuccess(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Fehler beim Speichern")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-[#d0dff0]">
      <CardHeader className="pb-2">
        <button
          className="flex w-full items-center justify-between gap-2"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#154c83]">
            <Brain className="h-4 w-4" />
            Trainerprofil für KI
            <span className="text-xs font-normal text-zinc-500">(optionale Feinsteuerung)</span>
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          )}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3 border-t border-[#eff4fa] pt-4">
          <p className="text-xs text-zinc-500">
            Diese Angaben werden bei der nächsten KI-Generierung als Feinsteuerung eingebunden.
            Alle weiteren Felder →{" "}
            <a href="/verwaltung/trainingsplanung/trainer-ki-profile" className="text-[#154c83] underline-offset-2 hover:underline">
              Trainer-KI-Stammdaten verwalten
            </a>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-zinc-600">Lizenz</Label>
              <Input
                value={data.trainer_license}
                onChange={(e) => {
                  setData((p) => ({ ...p, trainer_license: e.target.value.slice(0, 500) }))
                  setSaveSuccess(false)
                }}
                placeholder="z. B. Trainer C DOSB, Trainer B Boxen"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-zinc-600">Erfahrungslevel</Label>
              <Input
                value={data.trainer_experience_level}
                onChange={(e) => {
                  setData((p) => ({ ...p, trainer_experience_level: e.target.value.slice(0, 500) }))
                  setSaveSuccess(false)
                }}
                placeholder="z. B. 5 Jahre, Jugend + Erwachsene"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-zinc-600">Coaching-Stil</Label>
              <Input
                value={data.style}
                onChange={(e) => {
                  setData((p) => ({ ...p, style: e.target.value.slice(0, 500) }))
                  setSaveSuccess(false)
                }}
                placeholder="z. B. strukturiert, variationsreich, techniklastig"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-zinc-600">Stärken</Label>
              <Input
                value={data.strengths}
                onChange={(e) => {
                  setData((p) => ({ ...p, strengths: e.target.value.slice(0, 500) }))
                  setSaveSuccess(false)
                }}
                placeholder="z. B. Pratzentraining, Gruppenorganisation, Technikfokus"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-zinc-600">Boxspezifischer Fokus</Label>
              <Input
                value={data.focus}
                onChange={(e) => {
                  setData((p) => ({ ...p, focus: e.target.value.slice(0, 500) }))
                  setSaveSuccess(false)
                }}
                placeholder="z. B. Grundschule, Leistung, Jugend"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-zinc-600">Hinweise</Label>
              <Input
                value={data.notes}
                onChange={(e) => {
                  setData((p) => ({ ...p, notes: e.target.value.slice(0, 500) }))
                  setSaveSuccess(false)
                }}
                placeholder="z. B. bevorzugt kurze Blöcke, nutzt Ring selten"
              />
            </div>
          </div>
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="bg-[#154c83] text-white hover:bg-[#123d69]"
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Profil speichern
            </Button>
            {saveSuccess && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle className="h-3.5 w-3.5" />
                Gespeichert
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Entwurfsliste ────────────────────────────────────────────────────────────

function statusLabel(status: string, isTemplate: boolean) {
  if (isTemplate) return "Vorlage"
  if (status === "reviewed") return "Geprüft"
  if (status === "ai_generated") return "KI-Plan"
  if (status === "draft") return "Entwurf"
  return status
}

function statusBadgeClass(status: string, isTemplate: boolean) {
  if (isTemplate) return "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
  if (status === "reviewed") return "bg-[#eefaf3] text-emerald-700 hover:bg-[#e0f5e9]"
  if (status === "ai_generated") return "bg-[#eef8f0] text-green-700 hover:bg-[#e0f3e3]"
  return "bg-[#eef4fb] text-[#154c83] hover:bg-[#ddeaf9]"
}

type DraftListProps = {
  plans: TrainingPlan[]
  loading: boolean
  onLoadPlan: (plan: TrainingPlan) => void
}

function DraftList({ plans, loading, onLoadPlan }: DraftListProps) {
  const [filter, setFilter] = useState<FilterKey>("all")
  const [groupFilter, setGroupFilter] = useState<string>("all")
  const [planTypeFilter, setPlanTypeFilter] = useState<PlanType | "all">("all")

  const uniqueGroups = Array.from(new Set(plans.map((p) => p.group_key).filter(Boolean))).sort()

  const filtered = plans.filter((p) => {
    if (groupFilter !== "all" && p.group_key !== groupFilter) return false
    if (filter === "all") return true
    if (filter === "template") {
      if (!p.is_template) return false
      if (planTypeFilter !== "all" && (p.plan_type ?? "single") !== planTypeFilter) return false
      return true
    }
    if (filter === "reviewed") return p.status === "reviewed" && !p.is_template
    return p.status === filter
  })

  const counts: Record<FilterKey, number> = {
    all: plans.length,
    draft: plans.filter((p) => p.status === "draft").length,
    ai_generated: plans.filter((p) => p.status === "ai_generated").length,
    reviewed: plans.filter((p) => p.status === "reviewed" && !p.is_template).length,
    template: plans.filter((p) => p.is_template).length,
  }

  const templatePlanTypeCounts: Record<PlanType, number> = {
    single: plans.filter((p) => p.is_template && (p.plan_type ?? "single") === "single").length,
    combo: plans.filter((p) => p.is_template && p.plan_type === "combo").length,
    followup: plans.filter((p) => p.is_template && p.plan_type === "followup").length,
  }

  return (
    <Card className="border-[#d0dff0]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#154c83]">
            <CalendarDays className="h-4 w-4" />
            Gespeicherte Pläne
            {plans.length > 0 && (
              <Badge className="ml-1 bg-[#e8f0fb] text-[#154c83] hover:bg-[#ddeaf9]">{plans.length}</Badge>
            )}
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setFilter(opt.key)}
                className={
                  filter === opt.key
                    ? "rounded-full bg-[#154c83] px-3 py-1 text-xs font-semibold text-white"
                    : "rounded-full border border-[#d0dff0] px-3 py-1 text-xs font-medium text-zinc-600 hover:border-[#154c83] hover:text-[#154c83]"
                }
              >
                {opt.label}
                {counts[opt.key] > 0 && (
                  <span className={filter === opt.key ? " text-white/80" : " text-zinc-400"}>
                    {" "}
                    ({counts[opt.key]})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        {uniqueGroups.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => setGroupFilter("all")}
              className={
                groupFilter === "all"
                  ? "rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-[#d0dff0] px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-500 hover:text-zinc-800"
              }
            >
              Alle Gruppen
            </button>
            {uniqueGroups.map((g) => (
              <button
                key={g}
                onClick={() => setGroupFilter(g)}
                className={
                  groupFilter === g
                    ? "rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white"
                    : "rounded-full border border-[#d0dff0] px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-500 hover:text-zinc-800"
                }
              >
                {g}
              </button>
            ))}
          </div>
        )}
        {/* Planart-Filter – nur im Vorlagen-Tab */}
        {filter === "template" && counts.template > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["all", "single", "combo", "followup"] as const).map((t) => {
              const cnt = t === "all" ? counts.template : templatePlanTypeCounts[t]
              if (cnt === 0 && t !== "all") return null
              return (
                <button
                  key={t}
                  onClick={() => setPlanTypeFilter(t)}
                  className={
                    planTypeFilter === t
                      ? "rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-amber-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-amber-400"
                  }
                >
                  {t === "all" ? "Alle" : t === "single" ? "Einzelplan" : t === "combo" ? "Kombiplan" : "Folgeplan"}{" "}
                  ({cnt})
                </button>
              )
            })}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Wird geladen…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-sm text-zinc-500">
            {filter === "all" ? "Noch keine Pläne gespeichert." : "Keine Einträge in dieser Kategorie."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e2e8f0] text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="pb-2 pr-4">Datum</th>
                  <th className="pb-2 pr-4">Gruppe</th>
                  <th className="hidden pb-2 pr-4 sm:table-cell">Altersgruppe</th>
                  <th className="hidden pb-2 pr-4 text-right sm:table-cell">TN</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((plan) => (
                  <tr key={plan.id} className="border-b border-[#f0f4f9] last:border-0">
                    <td className="py-2 pr-4 font-medium text-zinc-800">
                      {formatGermanDate(plan.date)}
                      {plan.training_time && (
                        <span className="ml-1 text-xs font-normal text-zinc-500">{plan.training_time}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-zinc-700">
                      <span>{plan.group_key}</span>
                      {(plan.plan_type === "combo" || plan.plan_type === "followup") && (
                        <span
                          className={
                            plan.plan_type === "combo"
                              ? "ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700"
                              : "ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700"
                          }
                        >
                          {plan.plan_type === "combo" ? (
                            <><Layers className="h-2.5 w-2.5" />Kombi</>
                          ) : (
                            <><GitBranch className="h-2.5 w-2.5" />Folge</>
                          )}
                        </span>
                      )}
                      {plan.is_template && plan.template_name && (
                        <span className="ml-1 text-xs text-amber-600">({plan.template_name})</span>
                      )}
                    </td>
                    <td className="hidden py-2 pr-4 text-zinc-600 sm:table-cell">{plan.age_group ?? "—"}</td>
                    <td className="hidden py-2 pr-4 text-right text-zinc-600 sm:table-cell">
                      {plan.participant_count != null ? plan.participant_count : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge className={statusBadgeClass(plan.status, plan.is_template)}>
                          {plan.is_template && <Star className="mr-1 h-2.5 w-2.5" />}
                          {statusLabel(plan.status, plan.is_template)}
                        </Badge>
                        {plan.assigned_trainer_id && (
                          <Badge className="border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                            <UserCheck className="mr-1 h-2.5 w-2.5" />
                            Zugewiesen
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      {plan.generated_plan && (
                        <button
                          onClick={() => onLoadPlan(plan)}
                          className="text-xs font-medium text-[#154c83] hover:underline"
                        >
                          Laden
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Vorlage-Auswahl ─────────────────────────────────────────────────────────

type ActiveTemplate = {
  id: string
  plan_type: PlanType
  template_name: string | null
  title: string
  summary: string
  training_goal: string
}

type TemplateSelectorProps = {
  plans: TrainingPlan[]
  currentPlanType: PlanType
  activeTemplateId: string | null
  onSelect: (tpl: ActiveTemplate) => void
  onClear: () => void
}

function TemplateSelector({ plans, currentPlanType, activeTemplateId, onSelect, onClear }: TemplateSelectorProps) {
  const [open, setOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<PlanType | "all">("all")

  // Nur Pläne mit generiertem Inhalt und is_template-Flag
  const templates = plans.filter((p) => p.is_template && p.generated_plan)

  function qualityOrder(q: string | null): number {
    if (q === "standard") return 0
    if (q === "recommended") return 1
    if (q === "tested") return 2
    return 3
  }

  // Sortierung: passende Planart zuerst, dann Qualität (standard > recommended > tested > ohne), dann Datum
  const sorted = [...templates].sort((a, b) => {
    const aMatch = a.plan_type === currentPlanType ? 0 : 1
    const bMatch = b.plan_type === currentPlanType ? 0 : 1
    if (aMatch !== bMatch) return aMatch - bMatch
    const qa = qualityOrder(a.template_quality)
    const qb = qualityOrder(b.template_quality)
    if (qa !== qb) return qa - qb
    return b.date.localeCompare(a.date)
  })

  const filtered =
    typeFilter === "all" ? sorted : sorted.filter((p) => p.plan_type === typeFilter)

  const planTypeLabel = (t: PlanType): string =>
    t === "combo" ? "Kombi" : t === "followup" ? "Folge" : "Einzel"

  const planTypeBadgeClass = (t: PlanType): string =>
    t === "combo"
      ? "rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700"
      : t === "followup"
        ? "rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700"
        : "rounded-full bg-[#e8f0fb] px-2 py-0.5 text-[10px] font-semibold text-[#154c83]"

  function pickTemplate(p: TrainingPlan) {
    if (!p.generated_plan) return
    const parsed = JSON.parse(p.generated_plan) as {
      title?: string
      summary?: string
      training_goal?: string
    }
    onSelect({
      id: p.id,
      plan_type: (p.plan_type ?? "single") as PlanType,
      template_name: p.template_name,
      title: parsed.title ?? "",
      summary: parsed.summary ?? "",
      training_goal: parsed.training_goal ?? "",
    })
    setOpen(false)
  }

  if (templates.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={
            activeTemplateId
              ? "flex items-center gap-1.5 rounded-xl border-2 border-amber-400 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-800"
              : "flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 hover:border-amber-400"
          }
        >
          <Star className="h-4 w-4" />
          {activeTemplateId ? "Vorlage gewählt" : "Aus Vorlage starten"}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          <span className="ml-1 rounded-full bg-amber-200 px-1.5 text-xs font-bold text-amber-800">
            {templates.length}
          </span>
        </button>
        {activeTemplateId && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
            Vorlage entfernen
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-xl border border-amber-200 bg-white shadow-sm">
          <div className="border-b border-amber-100 px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "single", "combo", "followup"] as const).map((t) => {
                const count = t === "all" ? templates.length : templates.filter((p) => p.plan_type === t).length
                if (count === 0 && t !== "all") return null
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={
                      typeFilter === t
                        ? "rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white"
                        : "rounded-full border border-amber-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-amber-400"
                    }
                  >
                    {t === "all"
                      ? "Alle"
                      : t === "single"
                        ? "Einzelplan"
                        : t === "combo"
                          ? "Kombiplan"
                          : "Folgeplan"}{" "}
                    ({count})
                  </button>
                )
              })}
            </div>
            {currentPlanType !== "single" && typeFilter === "all" && (
              <p className="mt-1.5 text-[11px] text-amber-700">
                ↑ Vorlagen für „{currentPlanType === "combo" ? "Kombiplan" : "Folgeplan"}" werden zuerst angezeigt
              </p>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-amber-50">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500">Keine Vorlagen in dieser Kategorie.</p>
            ) : (
              filtered.map((p) => {
                const parsed = p.generated_plan
                  ? (JSON.parse(p.generated_plan) as { title?: string; summary?: string })
                  : null
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickTemplate(p)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-amber-50 ${activeTemplateId === p.id ? "bg-amber-50" : ""}`}
                  >
                    <div className="flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-800">
                          {p.template_name ?? parsed?.title ?? "Vorlage"}
                        </span>
                        <span className={planTypeBadgeClass((p.plan_type ?? "single") as PlanType)}>
                          {planTypeLabel((p.plan_type ?? "single") as PlanType)}
                        </span>
                        {p.plan_type === currentPlanType && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                            ✓ Passt
                          </span>
                        )}
                        {p.template_quality === "standard" && (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Standard</span>
                        )}
                        {p.template_quality === "recommended" && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Empfohlen</span>
                        )}
                        {p.template_quality === "tested" && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Getestet</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">
                        {p.group_key} · {formatGermanDate(p.date)}
                        {p.training_focus ? ` · ${p.training_focus}` : ""}
                      </p>
                      {parsed?.summary && (
                        <p className="line-clamp-1 text-xs text-zinc-400">{parsed.summary}</p>
                      )}
                    </div>
                    {activeTemplateId === p.id && (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Testszenarien ────────────────────────────────────────────────────────────

function TestSzenarienCard({ onPreFill }: { onPreFill: (values: Partial<FormValues>) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <Card className="border-[#d0dff0]">
      <CardHeader className="pb-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#154c83]">
            <FlaskConical className="h-4 w-4" />
            Testszenarien
            <span className="text-xs font-normal text-zinc-500">(interne Testphase)</span>
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="pt-4">
          <p className="mb-3 text-xs text-zinc-500">
            Klicke auf ein Szenario, um das Formular automatisch zu befüllen. Datum und KI-Kontext bleiben anpassbar.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {TEST_SCENARIOS.map((scenario, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPreFill(scenario.values)}
                className="flex flex-col items-start gap-1 rounded-xl border border-[#d0dff0] bg-[#f7fbff] p-3 text-left transition-colors hover:border-[#154c83] hover:bg-[#eef6ff]"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[#154c83]">
                  <BookMarked className="h-3.5 w-3.5" />
                  {scenario.label}
                </span>
                <span className="text-xs text-zinc-500">{scenario.description}</span>
              </button>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}



// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function TrainingsplanungPage() {
  const { resolved: authResolved, role: trainerRole, accountRole } = useTrainerAccess()
  const today = getTodayIsoDateInBerlin()

  const [form, setForm] = useState<FormValues>(() => emptyForm(today))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null)

  const [plans, setPlans] = useState<TrainingPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const [showPreview, setShowPreview] = useState(false)

  // Aktiver Plan (aus KI oder aus Liste geladen)
  const [activePlan, setActivePlan] = useState<GeneratedTrainingPlan | null>(null)
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [activePlanUsedFallback, setActivePlanUsedFallback] = useState(false)
  const [activePlanApiError, setActivePlanApiError] = useState<string | null>(null)
  const [activePlanContext, setActivePlanContext] = useState<PlanContext | null>(null)

  // KI-Generierung
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState("")

  // Aktive Vorlage
  const [activeTemplate, setActiveTemplate] = useState<ActiveTemplate | null>(null)

  // Auth-Guard
  useEffect(() => {
    if (!authResolved) return
    const isAdmin = trainerRole === "admin" || accountRole === "admin"
    if (!isAdmin) {
      clearTrainerAccess()
    }
  }, [authResolved, trainerRole, accountRole])

  // Entwürfe laden
  useEffect(() => {
    if (!authResolved || (trainerRole !== "admin" && accountRole !== "admin")) return

    void (async () => {
      try {
        setLoadError("")
        const response = await fetch("/api/admin/training-plans", { cache: "no-store" })
        if (!response.ok) {
          if (response.status === 401) {
            clearTrainerAccess()
            return
          }
          throw new Error(await response.text())
        }
        const payload = (await response.json()) as { plans: TrainingPlan[] }
        setPlans(payload.plans ?? [])
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Entwürfe konnten nicht geladen werden.")
      } finally {
        setPlansLoading(false)
      }
    })()
  }, [authResolved, trainerRole, accountRole])

  // Feldwechsel
  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaveSuccess(false)
    setSaveError("")
  }

  function handleGroupChange(val: string) {
    const defaults = GROUP_DEFAULTS[val]
    if (defaults) {
      setForm((prev) => ({ ...prev, group_key: val, ...defaults }))
    } else {
      setField("group_key", val)
    }
    setSaveSuccess(false)
    setSaveError("")
  }

  function handlePlanTypeChange(val: PlanType) {
    setForm((prev) => ({
      ...prev,
      plan_type: val,
      // Beim Wechsel irrelevante Felder zurücksetzen
      secondary_group_key: val === "followup" ? "" : prev.secondary_group_key,
      is_holiday_combined: val === "followup" ? false : prev.is_holiday_combined,
      based_on_plan_id: val !== "followup" ? "" : prev.based_on_plan_id,
    }))
    setSaveSuccess(false)
    setSaveError("")
  }

  function handleLoadTemplate(tpl: ActiveTemplate) {
    setActiveTemplate(tpl)
    // Planart und Ziel aus Vorlage übernehmen, Datum/Gruppe/Uhrzeit nicht überschreiben
    setForm((prev) => ({
      ...prev,
      plan_type: tpl.plan_type,
      training_goal: tpl.training_goal || prev.training_goal,
    }))
    setSaveSuccess(false)
    setSaveError("")
  }

  function handleClearTemplate() {
    setActiveTemplate(null)
  }

  // Speichern
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError("")
    setSaveSuccess(false)

    if (!form.date) {
      setSaveError("Bitte Datum eingeben.")
      return
    }
    if (!form.group_key) {
      setSaveError("Bitte Gruppe wählen.")
      return
    }

    setSavedPlanId(null)
    setSaving(true)
    try {
      const body = {
        date: form.date,
        group_key: form.group_key,
        training_time: form.training_time || null,
        age_group: form.age_group || null,
        performance_level: form.performance_level || null,
        participant_count: form.participant_count ? Number(form.participant_count) : null,
        trainer_count: form.trainer_count ? Number(form.trainer_count) : null,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        training_goal: form.training_goal || null,
        training_focus: form.training_focus || null,
        training_mode: form.training_mode || null,
        sparring_allowed: form.sparring_allowed,
        ring_available: form.ring_available,
        ai_context: form.ai_context || null,
        plan_type: form.plan_type,
        secondary_group_key: form.plan_type === "combo" && form.secondary_group_key ? form.secondary_group_key : null,
        is_holiday_combined: form.plan_type === "combo" ? form.is_holiday_combined : false,
        based_on_plan_id: form.plan_type === "followup" && form.based_on_plan_id ? form.based_on_plan_id : null,
      }

      const response = await fetch("/api/admin/training-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || "Speichern fehlgeschlagen.")
      }

      const payload = (await response.json()) as { plan: TrainingPlan }
      setPlans((prev) => [payload.plan, ...prev])
      setSaveSuccess(true)
      setSavedPlanId(payload.plan.id)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unbekannter Fehler beim Speichern.")
    } finally {
      setSaving(false)
    }
  }

  // KI-Generierung
  async function handleGenerate() {
    setGenerateError("")
    setActivePlan(null)
    setActivePlanId(null)
    setActivePlanUsedFallback(false)
    setActivePlanApiError(null)
    setActivePlanContext(null)

    if (!form.date || !form.group_key) {
      setGenerateError("Bitte mindestens Datum und Gruppe ausfüllen.")
      return
    }

    setGenerating(true)
    try {
      // Für Folgepläne: Vorgängerplan-Kontext aus der Planliste ableiten
      let basedOnPlanTitle: string | null = null
      let basedOnPlanSummary: string | null = null
      if (form.plan_type === "followup" && form.based_on_plan_id) {
        const refPlan = plans.find((p) => p.id === form.based_on_plan_id)
        if (refPlan?.generated_plan) {
          const parsed = parseStoredPlan(refPlan.generated_plan)
          basedOnPlanTitle = parsed?.title ?? null
          basedOnPlanSummary = parsed?.summary ?? null
        }
      }

      const body = {
        plan_id: savedPlanId ?? undefined,
        date: form.date,
        group_key: form.group_key,
        training_time: form.training_time || null,
        age_group: form.age_group || null,
        performance_level: form.performance_level || null,
        participant_count: form.participant_count ? Number(form.participant_count) : null,
        trainer_count: form.trainer_count ? Number(form.trainer_count) : null,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        training_goal: form.training_goal || null,
        training_focus: form.training_focus || null,
        training_mode: form.training_mode || null,
        sparring_allowed: form.sparring_allowed,
        ring_available: form.ring_available,
        ai_context: form.ai_context || null,
        plan_type: form.plan_type,
        secondary_group_key: form.plan_type === "combo" && form.secondary_group_key ? form.secondary_group_key : null,
        is_holiday_combined: form.plan_type === "combo" ? form.is_holiday_combined : false,
        based_on_plan_title: basedOnPlanTitle,
        based_on_plan_summary: basedOnPlanSummary,
        // Vorlage als strukturierender Ausgangspunkt
        template_name: activeTemplate?.template_name ?? null,
        template_plan_type: activeTemplate?.plan_type ?? null,
        template_title: activeTemplate?.title ?? null,
        template_summary: activeTemplate?.summary ?? null,
        template_training_goal: activeTemplate?.training_goal ?? null,
      }

      const res = await fetch("/api/admin/training-plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error((await res.text()) || "KI-Generierung fehlgeschlagen.")

      const data = (await res.json()) as {
        plan: GeneratedTrainingPlan
        usedFallback: boolean
        error: string | null
        updatedPlan: TrainingPlan | null
      }

      setActivePlan(data.plan)
      setActivePlanId(data.updatedPlan?.id ?? savedPlanId)
      setActivePlanUsedFallback(data.usedFallback)
      setActivePlanApiError(data.error)
      setActivePlanContext(formToPlanContext(form))

      if (data.updatedPlan) {
        setPlans((prev) =>
          prev.map((p) => (p.id === data.updatedPlan!.id ? data.updatedPlan! : p)),
        )
      }
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : "Unbekannter Fehler bei KI-Generierung.")
    } finally {
      setGenerating(false)
    }
  }

  function handlePreFill(values: Partial<FormValues>) {
    setForm((prev) => ({ ...prev, ...values }))
    setSaveSuccess(false)
    setSaveError("")
    setSavedPlanId(null)
  }

  function handleLoadPlan(plan: TrainingPlan) {
    const parsed = parseStoredPlan(plan.generated_plan)
    if (!parsed) return
    setActivePlan(parsed)
    setActivePlanId(plan.id)
    setActivePlanUsedFallback(false)
    setActivePlanApiError(null)
    setActivePlanContext(planToPlanContext(plan))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function handlePlanSaved(updatedPlan: TrainingPlan) {
    setPlans((prev) => prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p)))
  }

  if (!authResolved) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Wird geladen…
      </div>
    )
  }

  const isAdmin = trainerRole === "admin" || accountRole === "admin"
  if (!isAdmin) {
    return (
      <div className="py-12 text-center text-sm text-zinc-500">
        Kein Zugriff. Bitte als Admin anmelden.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Seitentitel */}
      <div>
        <h2 className="text-xl font-bold text-[#154c83] sm:text-2xl">Trainingsplanung</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Trainingspläne erfassen, mit KI erzeugen, nachbearbeiten und als Vorlage sichern.
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
          KI nutzt Basisprofil des BoxGyms (Material, Struktur, Trainingsprinzipien) –{" "}
          <a href="/verwaltung/trainingsplanung/ki-basisprofil" className="text-[#154c83] underline-offset-2 hover:underline">
            Basisprofil bearbeiten
          </a>
        </p>
        {/* Admin-Aktionen */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href="/verwaltung/trainingsplanung/trainer-vorschau"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <Eye className="h-3.5 w-3.5" />
            Traineransicht Thomas prüfen
          </a>
          <a
            href="/verwaltung/trainingsplanung/trainer-ki-profile"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d0dff0] bg-[#f0f6ff] px-3 py-1.5 text-xs font-medium text-[#154c83] hover:bg-[#e0edfb]"
          >
            <Users className="h-3.5 w-3.5" />
            Trainer-KI-Stammdaten verwalten
          </a>
        </div>
      </div>

      {/* Fehler beim Laden */}
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* KI-Plan anzeigen/bearbeiten */}
      {activePlan && (
        <EditablePlanView
          plan={activePlan}
          planId={activePlanId}
          usedFallback={activePlanUsedFallback}
          generationError={activePlanApiError}
          planContext={activePlanContext}
          onDismiss={() => setActivePlan(null)}
          onPlanSaved={handlePlanSaved}
        />
      )}

      {/* Trainer-Zuweisung: nur wenn Plan gespeichert (planId bekannt) */}
      {activePlan && activePlanId && (
        <TrainerAssignSection
          planId={activePlanId}
          currentAssignedTrainerId={
            plans.find((p) => p.id === activePlanId)?.assigned_trainer_id ?? null
          }
          onAssigned={(trainerId) => {
            setPlans((prev) =>
              prev.map((p) =>
                p.id === activePlanId ? { ...p, assigned_trainer_id: trainerId } : p,
              ),
            )
          }}
        />
      )}

      {/* Trainer-KI-Profil: nur wenn Trainer zugewiesen */}
      {activePlan &&
        activePlanId &&
        (plans.find((p) => p.id === activePlanId)?.assigned_trainer_id ?? null) && (
          <TrainerProfileSection
            trainerId={plans.find((p) => p.id === activePlanId)!.assigned_trainer_id!}
          />
        )}

      {/* Formular */}
      <Card className="border-[#d0dff0]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#154c83]">
            <Plus className="h-4 w-4" />
            Neuen Entwurf anlegen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
            {/* Planart */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-zinc-700">Planart</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "single", label: "Einzelplan", desc: "Eine Gruppe", icon: null },
                    { value: "combo", label: "Kombiplan", desc: "Mehrere Gruppen / Ferienbetrieb", icon: "combo" },
                    { value: "followup", label: "Folgeplan", desc: "Aufbauend auf vorherigem Plan", icon: "followup" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handlePlanTypeChange(opt.value)}
                    className={
                      form.plan_type === opt.value
                        ? opt.value === "combo"
                          ? "flex flex-col items-start rounded-xl border-2 border-teal-500 bg-teal-50 px-3.5 py-2.5 text-left"
                          : opt.value === "followup"
                            ? "flex flex-col items-start rounded-xl border-2 border-purple-500 bg-purple-50 px-3.5 py-2.5 text-left"
                            : "flex flex-col items-start rounded-xl border-2 border-[#154c83] bg-[#eef4fb] px-3.5 py-2.5 text-left"
                        : "flex flex-col items-start rounded-xl border border-[#d0dff0] bg-white px-3.5 py-2.5 text-left hover:border-zinc-400"
                    }
                  >
                    <span className={`flex items-center gap-1.5 text-sm font-semibold ${form.plan_type === opt.value && opt.value === "combo" ? "text-teal-700" : form.plan_type === opt.value && opt.value === "followup" ? "text-purple-700" : form.plan_type === opt.value ? "text-[#154c83]" : "text-zinc-700"}`}>
                      {opt.value === "combo" && <Layers className="h-3.5 w-3.5" />}
                      {opt.value === "followup" && <GitBranch className="h-3.5 w-3.5" />}
                      {opt.label}
                    </span>
                    <span className="text-xs text-zinc-500">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vorlage-Auswahl */}
            <TemplateSelector
              plans={plans}
              currentPlanType={form.plan_type}
              activeTemplateId={activeTemplate?.id ?? null}
              onSelect={handleLoadTemplate}
              onClear={handleClearTemplate}
            />

            {/* Aktive-Vorlage-Hinweis */}
            {activeTemplate && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm">
                <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <span className="font-semibold text-amber-800">
                    Vorlage aktiv: „{activeTemplate.template_name ?? activeTemplate.title}"
                  </span>
                  <p className="text-xs text-amber-700">
                    Die KI nutzt diese Vorlage als methodischen Rahmen und passt sie an die heutigen Rahmenbedingungen an.
                  </p>
                </div>
              </div>
            )}

            {/* Kombiplan-Zusatzfelder */}
            {form.plan_type === "combo" && (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  Kombiplan-Einstellungen
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="tp-secondary-group">Zusatzgruppe (optional)</Label>
                  <Select
                    value={form.secondary_group_key}
                    onValueChange={(v) => setField("secondary_group_key", v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger id="tp-secondary-group">
                      <SelectValue placeholder="Zweite Gruppe wählen…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— keine Angabe —</SelectItem>
                      {TRAINING_GROUPS.filter((g) => g !== form.group_key).map((group) => (
                        <SelectItem key={group} value={group}>
                          {group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_holiday_combined}
                    onChange={(e) => setField("is_holiday_combined", e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 accent-teal-600"
                  />
                  <span className="font-medium text-teal-800">Ferienbetrieb / Gruppen zusammengelegt</span>
                </label>
              </div>
            )}

            {/* Folgeplan-Zusatzfelder */}
            {form.plan_type === "followup" && (
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" />
                  Folgeplan-Einstellungen
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="tp-based-on">Auf diesem Plan aufbauen</Label>
                  <Select
                    value={form.based_on_plan_id}
                    onValueChange={(v) => setField("based_on_plan_id", v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger id="tp-based-on">
                      <SelectValue placeholder="Vorgängerplan wählen…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— keinen auswählen —</SelectItem>
                      {plans
                        .filter((p) => p.generated_plan)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {formatGermanDate(p.date)} · {p.group_key}
                            {p.training_focus ? ` · ${p.training_focus}` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-purple-700">
                    Die KI übernimmt den technischen Schwerpunkt des Vorgängerplans und passt ihn an diese Gruppe an.
                  </p>
                </div>
              </div>
            )}

            {/* Zeile 1: Datum + Gruppe + Uhrzeit */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tp-date">Datum *</Label>
                <Input
                  id="tp-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setField("date", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp-group">Gruppe *</Label>
                <Select value={form.group_key} onValueChange={handleGroupChange}>
                  <SelectTrigger id="tp-group">
                    <SelectValue placeholder="Gruppe wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAINING_GROUPS.map((group) => (
                      <SelectItem key={group} value={group}>
                        {group}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp-time">Uhrzeit</Label>
                <Input
                  id="tp-time"
                  type="time"
                  value={form.training_time}
                  onChange={(e) => setField("training_time", e.target.value)}
                />
              </div>
            </div>

            {/* Zeile 2: Altersgruppe + Niveau */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tp-age-group">Altersgruppe</Label>
                <Select value={form.age_group || "__none__"} onValueChange={(v) => setField("age_group", v === "__none__" ? "" : v)}>
                  <SelectTrigger id="tp-age-group">
                    <SelectValue placeholder="Altersgruppe wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— keine Angabe —</SelectItem>
                    {AGE_GROUP_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp-level">Leistungsniveau</Label>
                <Select value={form.performance_level || "__none__"} onValueChange={(v) => setField("performance_level", v === "__none__" ? "" : v)}>
                  <SelectTrigger id="tp-level">
                    <SelectValue placeholder="Niveau wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— keine Angabe —</SelectItem>
                    {PERFORMANCE_LEVEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Zeile 3: Zahlen */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tp-participants">Teilnehmerzahl</Label>
                <Input
                  id="tp-participants"
                  type="number"
                  min={1}
                  max={100}
                  placeholder="z. B. 12"
                  value={form.participant_count}
                  onChange={(e) => setField("participant_count", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp-trainers">Traineranzahl</Label>
                <Input
                  id="tp-trainers"
                  type="number"
                  min={1}
                  max={10}
                  placeholder="z. B. 2"
                  value={form.trainer_count}
                  onChange={(e) => setField("trainer_count", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp-duration">Dauer (Minuten)</Label>
                <Input
                  id="tp-duration"
                  type="number"
                  min={15}
                  max={300}
                  placeholder="z. B. 90"
                  value={form.duration_minutes}
                  onChange={(e) => setField("duration_minutes", e.target.value)}
                />
              </div>
            </div>

            {/* Trainingsziel */}
            <div className="space-y-1.5">
              <Label htmlFor="tp-goal">Trainingsziel / Fokus</Label>
              <Textarea
                id="tp-goal"
                placeholder="z. B. Technik Jab-Cross, Kombinationen, Kondition aufbauen…"
                value={form.training_goal}
                onChange={(e) => setField("training_goal", e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            {/* Zeile: Technischer Fokus + Trainingsmodus */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tp-focus">Technischer Fokus</Label>
                <Select value={form.training_focus || "__none__"} onValueChange={(v) => setField("training_focus", v === "__none__" ? "" : v)}>
                  <SelectTrigger id="tp-focus">
                    <SelectValue placeholder="Schwerpunkt wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— keine Angabe —</SelectItem>
                    {TRAINING_FOCUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp-mode">Trainingsmodus</Label>
                <Select value={form.training_mode || "__none__"} onValueChange={(v) => setField("training_mode", v === "__none__" ? "" : v)}>
                  <SelectTrigger id="tp-mode">
                    <SelectValue placeholder="Modus wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— keine Angabe —</SelectItem>
                    {TRAINING_MODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Checkboxen */}
            <div className="flex flex-wrap gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.sparring_allowed}
                  onChange={(e) => setField("sparring_allowed", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 accent-[#154c83]"
                />
                <span className="font-medium text-zinc-700">Sparring erlaubt</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ring_available}
                  onChange={(e) => setField("ring_available", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 accent-[#154c83]"
                />
                <span className="font-medium text-zinc-700">Ring verfügbar</span>
              </label>
            </div>

            {/* KI-Kontext */}
            <div className="space-y-1.5">
              <Label htmlFor="tp-ai-context" className="text-sm font-semibold text-[#154c83]">
                Zusatzinfos / Rahmenbedingungen
              </Label>
              <Textarea
                id="tp-ai-context"
                placeholder="Freitext für spätere KI-Generierung…"
                value={form.ai_context}
                onChange={(e) => setField("ai_context", e.target.value)}
                className="min-h-[120px]"
              />
              <p className="text-xs text-zinc-500">
                z. B. verfügbare Trainingsmittel, Platzsituation, Besonderheiten der Gruppe, Anfängeranteil, kein
                Sparring, Verletzungen, Tagesziel, Trainerbesetzung.
              </p>
            </div>

            {/* Feedback */}
            {saveError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
            )}
            {saveSuccess && (
              <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                Entwurf gespeichert.{" "}
                <span className="text-zinc-600">Jetzt KI-Plan erzeugen oder neuen Entwurf anlegen.</span>
              </p>
            )}

            {/* Aktionszeile */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#154c83] text-white hover:bg-[#1a5e9f]"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichern…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Als Entwurf speichern
                  </>
                )}
              </Button>

              <Button
                type="button"
                disabled={generating || !form.date || !form.group_key}
                onClick={() => void handleGenerate()}
                className="bg-gradient-to-r from-[#154c83] to-[#1d6bbf] text-white hover:from-[#1a5e9f] hover:to-[#2278d4] disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    KI generiert…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Mit KI Trainingsplan erzeugen
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPreview((v) => !v)}
                className="border-[#cdd9e6] text-[#154c83] hover:bg-[#f7fbff]"
              >
                {showPreview ? (
                  <>
                    <ChevronUp className="mr-1.5 h-4 w-4" />
                    Vorschau ausblenden
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1.5 h-4 w-4" />
                    Vorschau anzeigen
                  </>
                )}
              </Button>
            </div>

            {(!form.date || !form.group_key) && (
              <p className="text-xs text-zinc-400">
                Für KI-Generierung: bitte mindestens Datum und Gruppe ausfüllen.
              </p>
            )}

            {generateError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {generateError}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Eingabe-Vorschau */}
      {showPreview && <PlanPreview values={form} />}

      {/* Testszenarien */}
      <TestSzenarienCard onPreFill={handlePreFill} />

      {/* Entwurfsliste */}
      <DraftList plans={plans} loading={plansLoading} onLoadPlan={handleLoadPlan} />
    </div>
  )
}
