"use client"

import { useEffect, useState } from "react"
import {
  Award,
  BookMarked,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Layers,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Star,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"
import type { TemplateQuality } from "@/lib/trainingPlansDb"

// ─── Typen ─────────────────────────────────────────────────────────────────────

type PlanType = "single" | "combo" | "followup"

type Template = {
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
  plan_type: PlanType
  secondary_group_key: string | null
  is_holiday_combined: boolean
  generated_plan: string | null
  status: string
  is_template: boolean
  template_name: string | null
  template_quality: TemplateQuality | null
  created_at: string
}

type ParsedPlan = {
  title?: string
  summary?: string
  training_goal?: string
  organization_notes?: string
}

// ─── Hilfsformat ───────────────────────────────────────────────────────────────

function formatGermanDate(isoDate: string) {
  const parts = isoDate.split("-")
  if (parts.length !== 3) return isoDate
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function parsePlan(raw: string | null): ParsedPlan | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ParsedPlan
  } catch {
    return null
  }
}

// ─── Badges ────────────────────────────────────────────────────────────────────

const QUALITY_CONFIG: Record<
  TemplateQuality,
  { label: string; className: string; icon: React.ReactNode }
> = {
  standard: {
    label: "Standard",
    className: "border border-blue-200 bg-blue-50 text-blue-700",
    icon: <ShieldCheck className="h-3 w-3" />,
  },
  recommended: {
    label: "Empfohlen",
    className: "border border-amber-200 bg-amber-50 text-amber-700",
    icon: <Star className="h-3 w-3" />,
  },
  tested: {
    label: "Getestet",
    className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: <CheckCircle className="h-3 w-3" />,
  },
}

function QualityBadge({ quality }: { quality: TemplateQuality | null }) {
  if (!quality) return null
  const cfg = QUALITY_CONFIG[quality]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function PlanTypeBadge({ planType }: { planType: PlanType }) {
  if (planType === "combo") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
        <Layers className="h-3 w-3" />
        Kombi
      </span>
    )
  }
  if (planType === "followup") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
        <GitBranch className="h-3 w-3" />
        Folge
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f0fb] px-2 py-0.5 text-[11px] font-semibold text-[#154c83]">
      Einzel
    </span>
  )
}

// ─── Qualitäts-Stepper ─────────────────────────────────────────────────────────

const QUALITY_ORDER: Array<TemplateQuality | null> = [null, "tested", "recommended", "standard"]

function QualityStepper({
  current,
  planId,
  onUpdate,
}: {
  current: TemplateQuality | null
  planId: string
  onUpdate: (id: string, q: TemplateQuality | null) => void
}) {
  const [saving, setSaving] = useState(false)

  async function handleSet(q: TemplateQuality | null) {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/training-plans/${planId}/quality`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quality: q }),
      })
      if (!res.ok) throw new Error(await res.text())
      onUpdate(planId, q)
    } catch (e) {
      console.error("Quality update failed", e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
      {(["tested", "recommended", "standard"] as TemplateQuality[]).map((q) => {
        const cfg = QUALITY_CONFIG[q]
        const isActive = current === q
        return (
          <button
            key={q}
            type="button"
            disabled={saving}
            onClick={() => void handleSet(isActive ? null : q)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
              isActive
                ? cfg.className
                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
            }`}
            title={isActive ? "Bewertung entfernen" : `Als „${cfg.label}" markieren`}
          >
            {cfg.icon}
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Vorlagen-Karte ────────────────────────────────────────────────────────────

function TemplateCard({
  tpl,
  expanded,
  onToggle,
  onQualityUpdate,
}: {
  tpl: Template
  expanded: boolean
  onToggle: () => void
  onQualityUpdate: (id: string, q: TemplateQuality | null) => void
}) {
  const parsed = parsePlan(tpl.generated_plan)

  return (
    <div className="rounded-xl border border-[#d0dff0] bg-white">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          {/* Name + Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
              <BookMarked className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              {tpl.template_name ?? parsed?.title ?? "Vorlage"}
            </span>
            <PlanTypeBadge planType={tpl.plan_type} />
            <QualityBadge quality={tpl.template_quality} />
          </div>

          {/* Metazeile */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-500">
            <span>{tpl.group_key}</span>
            {tpl.secondary_group_key && (
              <span className="text-teal-600">+ {tpl.secondary_group_key}</span>
            )}
            {tpl.is_holiday_combined && <span className="text-teal-600">Ferienbetrieb</span>}
            {tpl.age_group && <span>{tpl.age_group}</span>}
            {tpl.performance_level && <span>{tpl.performance_level}</span>}
            {tpl.duration_minutes && <span>{tpl.duration_minutes} min</span>}
            <span>{formatGermanDate(tpl.date)}</span>
          </div>

          {/* Fokus + Modus */}
          {(tpl.training_focus || tpl.training_mode) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tpl.training_focus && (
                <span className="rounded-full border border-[#d0dff0] bg-[#f0f6ff] px-2 py-0.5 text-[11px] font-medium text-[#154c83]">
                  {tpl.training_focus}
                </span>
              )}
              {tpl.training_mode && (
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                  {tpl.training_mode}
                </span>
              )}
            </div>
          )}

          {/* Qualitätsbewertung setzen */}
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Qualitätsstatus
            </p>
            <QualityStepper
              current={tpl.template_quality}
              planId={tpl.id}
              onUpdate={onQualityUpdate}
            />
          </div>
        </div>

        {/* Expand-Toggle */}
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          aria-label={expanded ? "Zuklappen" : "Details anzeigen"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Details */}
      {expanded && parsed && (
        <div className="border-t border-[#eef3f8] px-4 pb-4 pt-3 space-y-2">
          {parsed.title && (
            <p className="text-sm font-medium text-zinc-800">{parsed.title}</p>
          )}
          {parsed.summary && (
            <p className="text-sm text-zinc-600">{parsed.summary}</p>
          )}
          {(parsed.training_goal ?? tpl.training_goal) && (
            <p className="text-xs text-zinc-500">
              <span className="font-medium">Ziel:</span>{" "}
              {parsed.training_goal ?? tpl.training_goal}
            </p>
          )}
          {parsed.organization_notes && (
            <p className="text-xs text-zinc-500">
              <span className="font-medium">Organisation:</span> {parsed.organization_notes}
            </p>
          )}
          <div className="pt-1 flex flex-wrap gap-2 text-xs text-zinc-400">
            {tpl.participant_count != null && <span>👥 {tpl.participant_count} Personen</span>}
            {tpl.trainer_count != null && <span>🏋️ {tpl.trainer_count} Trainer</span>}
            <span>{tpl.sparring_allowed ? "✓ Sparring" : "✗ kein Sparring"}</span>
            <span>{tpl.ring_available ? "✓ Ring" : "✗ kein Ring"}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Filter ────────────────────────────────────────────────────────────────────

type Filters = {
  planType: PlanType | "all"
  quality: TemplateQuality | "none" | "all"
  group: string
}

// ─── Hauptkomponente ───────────────────────────────────────────────────────────

export default function VorlagenbibliothekPage() {
  const { resolved: authResolved, role: trainerRole, accountRole } = useTrainerAccess()

  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>({
    planType: "all",
    quality: "all",
    group: "all",
  })

  // Auth-Guard
  useEffect(() => {
    if (!authResolved) return
    const isAdmin = trainerRole === "admin" || accountRole === "admin"
    if (!isAdmin) clearTrainerAccess()
  }, [authResolved, trainerRole, accountRole])

  // Vorlagen laden
  useEffect(() => {
    if (!authResolved || (trainerRole !== "admin" && accountRole !== "admin")) return
    void (async () => {
      try {
        const res = await fetch("/api/admin/training-plans", { cache: "no-store" })
        if (!res.ok) {
          if (res.status === 401) { clearTrainerAccess(); return }
          throw new Error(await res.text())
        }
        const payload = (await res.json()) as { plans: Template[] }
        setTemplates((payload.plans ?? []).filter((p) => p.is_template))
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Vorlagen konnten nicht geladen werden.")
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, trainerRole, accountRole])

  function handleQualityUpdate(id: string, q: TemplateQuality | null) {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, template_quality: q } : t)))
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

  // Unique-Gruppen aus Vorlagen
  const uniqueGroups = Array.from(new Set(templates.map((t) => t.group_key))).sort()

  // Sortierfunktion: standard > recommended > tested > null, dann nach Datum
  function qualityOrder(q: TemplateQuality | null): number {
    if (q === "standard") return 0
    if (q === "recommended") return 1
    if (q === "tested") return 2
    return 3
  }

  const filtered = templates
    .filter((t) => {
      if (filters.planType !== "all" && t.plan_type !== filters.planType) return false
      if (filters.quality === "none" && t.template_quality !== null) return false
      if (
        filters.quality !== "all" &&
        filters.quality !== "none" &&
        t.template_quality !== filters.quality
      ) return false
      if (filters.group !== "all" && t.group_key !== filters.group) return false
      return true
    })
    .sort((a, b) => {
      const qa = qualityOrder(a.template_quality)
      const qb = qualityOrder(b.template_quality)
      if (qa !== qb) return qa - qb
      return b.date.localeCompare(a.date)
    })

  const counts = {
    all: templates.length,
    standard: templates.filter((t) => t.template_quality === "standard").length,
    recommended: templates.filter((t) => t.template_quality === "recommended").length,
    tested: templates.filter((t) => t.template_quality === "tested").length,
    none: templates.filter((t) => t.template_quality === null).length,
  }

  const planTypeCounts = {
    single: templates.filter((t) => t.plan_type === "single" || !t.plan_type).length,
    combo: templates.filter((t) => t.plan_type === "combo").length,
    followup: templates.filter((t) => t.plan_type === "followup").length,
  }

  return (
    <div className="space-y-6">
      {/* Titel */}
      <div>
        <h2 className="text-xl font-bold text-[#154c83] sm:text-2xl">Vorlagenbibliothek</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Geprüfte Vereinsvorlagen – nach Planart filtern, Qualität bewerten, als Standard markieren.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Filter-Panel */}
      <Card className="border-[#d0dff0]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#154c83]">Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Planart */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Planart</p>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "single", "combo", "followup"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilters((f) => ({ ...f, planType: t }))}
                  className={
                    filters.planType === t
                      ? t === "combo"
                        ? "rounded-full bg-teal-500 px-3 py-1 text-xs font-semibold text-white"
                        : t === "followup"
                          ? "rounded-full bg-purple-500 px-3 py-1 text-xs font-semibold text-white"
                          : "rounded-full bg-[#154c83] px-3 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-[#d0dff0] px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-400"
                  }
                >
                  {t === "all" ? `Alle (${counts.all})` : t === "single" ? `Einzel (${planTypeCounts.single})` : t === "combo" ? `Kombi (${planTypeCounts.combo})` : `Folge (${planTypeCounts.followup})`}
                </button>
              ))}
            </div>
          </div>

          {/* Qualität */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Qualitätsstatus</p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { key: "all", label: `Alle (${counts.all})` },
                  { key: "standard", label: `Standard (${counts.standard})` },
                  { key: "recommended", label: `Empfohlen (${counts.recommended})` },
                  { key: "tested", label: `Getestet (${counts.tested})` },
                  { key: "none", label: `Ohne Bewertung (${counts.none})` },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilters((f) => ({ ...f, quality: key }))}
                  className={
                    filters.quality === key
                      ? "rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-[#d0dff0] px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-400"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Gruppe */}
          {uniqueGroups.length > 1 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Gruppe</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFilters((f) => ({ ...f, group: "all" }))}
                  className={
                    filters.group === "all"
                      ? "rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-[#d0dff0] px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-400"
                  }
                >
                  Alle
                </button>
                {uniqueGroups.map((g) => (
                  <button
                    key={g}
                    onClick={() => setFilters((f) => ({ ...f, group: g }))}
                    className={
                      filters.group === g
                        ? "rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white"
                        : "rounded-full border border-[#d0dff0] px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-400"
                    }
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reset */}
          {(filters.planType !== "all" || filters.quality !== "all" || filters.group !== "all") && (
            <button
              onClick={() => setFilters({ planType: "all", quality: "all", group: "all" })}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Filter zurücksetzen
            </button>
          )}
        </CardContent>
      </Card>

      {/* Vorlagen */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Vorlagen werden geladen…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-[#d0dff0]">
          <CardContent className="py-8 text-center text-sm text-zinc-500">
            {templates.length === 0
              ? "Noch keine Vorlagen gespeichert. Geprüfte Pläne in der Trainingsplanung als Vorlage markieren."
              : "Keine Vorlagen für die gewählten Filter."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-500">
              {filtered.length} Vorlage{filtered.length !== 1 ? "n" : ""}{" "}
              {filtered.length < templates.length && `von ${templates.length}`}
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Award className="h-3.5 w-3.5" />
              Sortiert: Standard → Empfohlen → Getestet → ohne Bewertung
            </div>
          </div>
          {filtered.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              expanded={expandedId === tpl.id}
              onToggle={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
              onQualityUpdate={handleQualityUpdate}
            />
          ))}
        </div>
      )}

      {/* Hinweis */}
      {templates.length === 0 && !loading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Tipp:</span> In der{" "}
          <a href="/verwaltung/trainingsplanung" className="underline underline-offset-2">
            Trainingsplanung
          </a>{" "}
          geprüfte Pläne mit „Als Vorlage speichern" sichern. Sie erscheinen dann hier und im
          Vorlage-Selektor beim Erstellen neuer Pläne.
        </div>
      )}
    </div>
  )
}
