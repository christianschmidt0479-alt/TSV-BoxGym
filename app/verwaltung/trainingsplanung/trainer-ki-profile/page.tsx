"use client"

import { useEffect, useState } from "react"
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  Save,
  Shield,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

// ─── Typen ────────────────────────────────────────────────────────────────────

type TrainerKiProfile = {
  trainer_id: string
  style: string | null
  strengths: string | null
  focus: string | null
  notes: string | null
  internal_label: string | null
  trainer_license: string | null
  trainer_experience_level: string | null
  trainer_limitations: string | null
  trainer_group_handling: string | null
  trainer_pedagogy_notes: string | null
  preferred_structure_level: string | null
  admin_internal_notes: string | null
  updated_at: string
}

type TrainerWithProfile = {
  id: string
  first_name: string
  last_name: string
  email: string
  role: string
  is_approved: boolean
  profile: TrainerKiProfile | null
}

type FormData = {
  internal_label: string
  trainer_license: string
  trainer_experience_level: string
  style: string
  strengths: string
  focus: string
  preferred_structure_level: string
  trainer_limitations: string
  trainer_group_handling: string
  trainer_pedagogy_notes: string
  notes: string
  admin_internal_notes: string
}

function emptyForm(): FormData {
  return {
    internal_label: "",
    trainer_license: "",
    trainer_experience_level: "",
    style: "",
    strengths: "",
    focus: "",
    preferred_structure_level: "",
    trainer_limitations: "",
    trainer_group_handling: "",
    trainer_pedagogy_notes: "",
    notes: "",
    admin_internal_notes: "",
  }
}

function profileToForm(profile: TrainerKiProfile | null): FormData {
  return {
    internal_label: profile?.internal_label ?? "",
    trainer_license: profile?.trainer_license ?? "",
    trainer_experience_level: profile?.trainer_experience_level ?? "",
    style: profile?.style ?? "",
    strengths: profile?.strengths ?? "",
    focus: profile?.focus ?? "",
    preferred_structure_level: profile?.preferred_structure_level ?? "",
    trainer_limitations: profile?.trainer_limitations ?? "",
    trainer_group_handling: profile?.trainer_group_handling ?? "",
    trainer_pedagogy_notes: profile?.trainer_pedagogy_notes ?? "",
    notes: profile?.notes ?? "",
    admin_internal_notes: profile?.admin_internal_notes ?? "",
  }
}

// ─── Trainer-Zeile mit Formular ───────────────────────────────────────────────

function TrainerKiCard({ trainer }: { trainer: TrainerWithProfile }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormData>(() => profileToForm(trainer.profile))
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState("")

  function setField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaveSuccess(false)
    setSaveError("")
  }

  async function handleSave() {
    setSaving(true)
    setSaveSuccess(false)
    setSaveError("")
    try {
      const res = await fetch(`/api/admin/trainer-profiles/${trainer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          internal_label: form.internal_label.trim() || null,
          trainer_license: form.trainer_license.trim() || null,
          trainer_experience_level: form.trainer_experience_level.trim() || null,
          style: form.style.trim() || null,
          strengths: form.strengths.trim() || null,
          focus: form.focus.trim() || null,
          preferred_structure_level: form.preferred_structure_level.trim() || null,
          trainer_limitations: form.trainer_limitations.trim() || null,
          trainer_group_handling: form.trainer_group_handling.trim() || null,
          trainer_pedagogy_notes: form.trainer_pedagogy_notes.trim() || null,
          notes: form.notes.trim() || null,
          admin_internal_notes: form.admin_internal_notes.trim() || null,
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

  const hasProfile = !!(
    (trainer.profile?.style) ||
    (trainer.profile?.strengths) ||
    (trainer.profile?.focus) ||
    (trainer.profile?.trainer_license) ||
    (trainer.profile?.trainer_experience_level) ||
    (trainer.profile?.trainer_limitations) ||
    (trainer.profile?.trainer_group_handling) ||
    (trainer.profile?.trainer_pedagogy_notes) ||
    (trainer.profile?.preferred_structure_level) ||
    (trainer.profile?.notes) ||
    (trainer.profile?.admin_internal_notes) ||
    (trainer.profile?.internal_label)
  )

  return (
    <Card className="border-[#d0dff0]">
      <CardHeader className="pb-2">
        <button
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-800">
                {trainer.first_name} {trainer.last_name}
              </span>
              {trainer.role === "admin" && (
                <span className="rounded-full bg-[#154c83] px-2 py-0.5 text-[10px] font-semibold text-white">
                  Admin
                </span>
              )}
              {hasProfile && (
                <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  Profil angelegt
                </span>
              )}
            </div>
            <span className="truncate text-xs text-zinc-500">{trainer.email}</span>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
          )}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5 border-t border-[#eff4fa] pt-4">
          <p className="text-xs text-zinc-500">
            Diese Daten sind ausschließlich für den Admin sichtbar und werden bei der KI-Trainingsplanung
            serverseitig eingebunden. Trainer sehen diese Informationen nicht.
          </p>

          {/* Gruppe 1: Identifikation */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Identifikation</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-zinc-600">Interne Bezeichnung</Label>
                <Input
                  value={form.internal_label}
                  onChange={(e) => setField("internal_label", e.target.value.slice(0, 500))}
                  placeholder="z. B. Thomas – Pilot-Trainer"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-zinc-600">Lizenz</Label>
                <Input
                  value={form.trainer_license}
                  onChange={(e) => setField("trainer_license", e.target.value.slice(0, 500))}
                  placeholder="z. B. Trainer C DOSB, Trainer B Boxen"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-zinc-600">Erfahrungslevel</Label>
              <Input
                value={form.trainer_experience_level}
                onChange={(e) => setField("trainer_experience_level", e.target.value.slice(0, 500))}
                placeholder="z. B. 5 Jahre Vereinstraining, Jugend + Erwachsene, ehem. Wettkämpfer"
              />
            </div>
          </div>

          {/* Gruppe 2: KI-Coaching-Stil */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">KI-Coaching-Stil</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-zinc-600">Coaching-Stil</Label>
                <Input
                  value={form.style}
                  onChange={(e) => setField("style", e.target.value.slice(0, 500))}
                  placeholder="z. B. strukturiert, variationsreich, techniklastig"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-zinc-600">Stärken</Label>
                <Input
                  value={form.strengths}
                  onChange={(e) => setField("strengths", e.target.value.slice(0, 500))}
                  placeholder="z. B. Pratzentraining, Gruppenorganisation"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-zinc-600">Boxspezifischer Fokus</Label>
                <Input
                  value={form.focus}
                  onChange={(e) => setField("focus", e.target.value.slice(0, 500))}
                  placeholder="z. B. Grundschule, Jugend, Leistungsbereich"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-zinc-600">Bevorzugte Strukturierungstiefe</Label>
                <Input
                  value={form.preferred_structure_level}
                  onChange={(e) => setField("preferred_structure_level", e.target.value.slice(0, 500))}
                  placeholder="z. B. detaillierte Blöcke, flexible Rahmenstruktur"
                />
              </div>
            </div>
          </div>

          {/* Gruppe 3: KI-Details */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">KI-Details</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-zinc-600">Besonderheiten / Einschränkungen</Label>
                <Textarea
                  value={form.trainer_limitations}
                  onChange={(e) => setField("trainer_limitations", e.target.value.slice(0, 1000))}
                  placeholder="z. B. bevorzugt keine Pratzenarbeit, nutzt Ring selten, kein Sparring in Jugendgruppen"
                  rows={2}
                  className="resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-zinc-600">Gruppenführung</Label>
                <Textarea
                  value={form.trainer_group_handling}
                  onChange={(e) => setField("trainer_group_handling", e.target.value.slice(0, 1000))}
                  placeholder="z. B. bevorzugt Stationsbetrieb bei großen Gruppen, ruhige Führung, strukturierte Übergänge"
                  rows={2}
                  className="resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-zinc-600">Pädagogische Hinweise</Label>
                <Textarea
                  value={form.trainer_pedagogy_notes}
                  onChange={(e) => setField("trainer_pedagogy_notes", e.target.value.slice(0, 1000))}
                  placeholder="z. B. legt Wert auf ausführliche Erklärungen, nutzt viele Demonstrationen, niederschwellige Sprache"
                  rows={2}
                  className="resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-zinc-600">Weitere / allgemeine Hinweise</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value.slice(0, 1000))}
                  placeholder="z. B. bevorzugt kurze Blöcke, steigt gerne mit Spiel ein"
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>
          </div>

          {/* Gruppe 4: Admin-intern */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Admin-intern (nie an KI übergeben)</p>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-zinc-600">Admin-interne Notizen</Label>
              <Textarea
                value={form.admin_internal_notes}
                onChange={(e) => setField("admin_internal_notes", e.target.value.slice(0, 1000))}
                placeholder="z. B. nur provisorisch zugewiesen, Freigabe ausstehend, Feedback aus Test-KW10"
                rows={3}
                className="resize-none border-amber-200 bg-amber-50/40 focus-visible:ring-amber-300"
              />
              <p className="text-[10px] text-amber-700">
                Diese Notizen werden nicht an die KI weitergegeben und sind ausschließlich für Admins sichtbar.
              </p>
            </div>
          </div>

          {saveError && <p className="text-xs text-red-600">{saveError}</p>}

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="gap-1.5 bg-[#154c83] hover:bg-[#123d69]"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Speichern…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  KI-Stammdaten speichern
                </>
              )}
            </Button>
            {saveSuccess && (
              <span className="text-xs font-medium text-green-600">Gespeichert.</span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function TrainerKiProfilePage() {
  const { accountRole, resolved } = useTrainerAccess()

  const [trainers, setTrainers] = useState<TrainerWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  // Admin-Guard
  useEffect(() => {
    if (resolved && accountRole !== "admin") {
      clearTrainerAccess()
    }
  }, [resolved, accountRole])

  useEffect(() => {
    if (!resolved || accountRole !== "admin") return
    fetch("/api/admin/trainer-ki-profiles", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ trainers: TrainerWithProfile[] }>
      })
      .then((res) => {
        setTrainers(res.trainers ?? [])
        setLoading(false)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Fehler beim Laden")
        setLoading(false)
      })
  }, [resolved, accountRole])

  if (!resolved || accountRole !== "admin") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#154c83]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Admin-Banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-700" />
          <span className="text-sm font-semibold text-amber-800">
            Admin-Bereich: Trainer-KI-Stammdaten
          </span>
        </div>
        <p className="mt-1 text-xs text-amber-700">
          Diese Daten sind ausschließlich für Admins sichtbar. Trainer können diese Informationen weder
          einsehen noch bearbeiten. Sie werden bei der KI-Trainingsplanung serverseitig eingebunden.
        </p>
      </div>

      {/* Seitentitel */}
      <div>
        <h2 className="text-xl font-bold text-[#154c83] sm:text-2xl">Trainer-KI-Stammdaten</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Verdeckte interne KI-Profile pro Trainer pflegen.
          Die KI nutzt diese Daten bei der Planerstellung als Feinsteuerung (Priorität 3 – nach
          BoxGym-Basisprofil und Gruppen-/Einheitsdaten).
        </p>
      </div>

      {/* Prioritätsreihenfolge */}
      <Card className="border-[#d0dff0] bg-[#f8fafc]">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-[#154c83]" />
            <span className="text-sm font-semibold text-[#154c83]">KI-Gewichtung bei Planerststellung</span>
          </div>
          <ol className="space-y-0.5 text-xs text-zinc-600">
            <li className="flex gap-2"><span className="font-bold text-[#154c83]">1.</span> BoxGym-Basisprofil (Material, Trainingsprinzipien)</li>
            <li className="flex gap-2"><span className="font-bold text-[#154c83]">2.</span> Gruppen- und Einheitsdaten (Modus, Fokus, Ziel)</li>
            <li className="flex gap-2"><span className="font-bold text-[#154c83]">3.</span> Internes Trainer-KI-Profil (diese Seite)</li>
            <li className="flex gap-2"><span className="font-bold text-[#154c83]">4.</span> Tageshinweise / Zusatzinfos (KI-Kontext-Feld)</li>
          </ol>
        </CardContent>
      </Card>

      {/* Ladeindikator */}
      {loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Trainer werden geladen…
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Trainer-Liste */}
      {!loading && !loadError && trainers.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Users className="h-10 w-10 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-600">Keine Trainer gefunden</p>
          <p className="text-xs text-zinc-500">
            Wenn Trainer-Accounts vorhanden sind, erscheinen sie hier.
          </p>
        </div>
      )}

      {!loading && !loadError && trainers.length > 0 && (
        <div className="space-y-3">
          {trainers.map((trainer) => (
            <TrainerKiCard key={trainer.id} trainer={trainer} />
          ))}
        </div>
      )}

      {/* Zurück-Link */}
      <div className="pt-2">
        <a
          href="/verwaltung/trainingsplanung"
          className="text-sm text-[#154c83] underline-offset-2 hover:underline"
        >
          ← Zurück zur Trainingsplanung
        </a>
      </div>
    </div>
  )
}
