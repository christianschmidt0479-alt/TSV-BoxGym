"use client"

import { useEffect, useState } from "react"
import { Brain, CheckCircle, Loader2, Save } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useTrainerAccess } from "@/lib/useTrainerAccess"
import { clearTrainerAccess } from "@/lib/trainerAccess"
import type { TrainingAiContext } from "@/lib/trainingAiContextDb"

type FormState = {
  has_ring: boolean
  ring_often_available: boolean
  heavy_bags_count: string
  mitts_pairs_count: string
  jump_ropes_count: string
  medicine_balls_count: string
  max_group_size: string
  space_description: string
  training_principles: string
  group_characteristics: string
}

function contextToForm(ctx: TrainingAiContext): FormState {
  return {
    has_ring: ctx.has_ring,
    ring_often_available: ctx.ring_often_available,
    heavy_bags_count: String(ctx.heavy_bags_count),
    mitts_pairs_count: String(ctx.mitts_pairs_count),
    jump_ropes_count: String(ctx.jump_ropes_count),
    medicine_balls_count: String(ctx.medicine_balls_count),
    max_group_size: String(ctx.max_group_size),
    space_description: ctx.space_description,
    training_principles: ctx.training_principles,
    group_characteristics: ctx.group_characteristics,
  }
}

function formToBody(f: FormState): Record<string, unknown> {
  return {
    has_ring: f.has_ring,
    ring_often_available: f.ring_often_available,
    heavy_bags_count: f.heavy_bags_count ? Number(f.heavy_bags_count) : 0,
    mitts_pairs_count: f.mitts_pairs_count ? Number(f.mitts_pairs_count) : 0,
    jump_ropes_count: f.jump_ropes_count ? Number(f.jump_ropes_count) : 0,
    medicine_balls_count: f.medicine_balls_count ? Number(f.medicine_balls_count) : 0,
    max_group_size: f.max_group_size ? Number(f.max_group_size) : 20,
    space_description: f.space_description,
    training_principles: f.training_principles,
    group_characteristics: f.group_characteristics,
  }
}

function defaultForm(): FormState {
  return {
    has_ring: true,
    ring_often_available: true,
    heavy_bags_count: "8",
    mitts_pairs_count: "6",
    jump_ropes_count: "12",
    medicine_balls_count: "4",
    max_group_size: "20",
    space_description: "",
    training_principles: "",
    group_characteristics: "",
  }
}

export default function KiBasisprofil() {
  const { resolved: authResolved, role: trainerRole, accountRole } = useTrainerAccess()

  const [form, setForm] = useState<FormState>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  // Auth-Guard
  useEffect(() => {
    if (!authResolved) return
    const isAdmin = trainerRole === "admin" || accountRole === "admin"
    if (!isAdmin) clearTrainerAccess()
  }, [authResolved, trainerRole, accountRole])

  // Daten laden
  useEffect(() => {
    if (!authResolved) return
    const isAdmin = trainerRole === "admin" || accountRole === "admin"
    if (!isAdmin) return

    void (async () => {
      try {
        const res = await fetch("/api/admin/training-ai-context", { cache: "no-store" })
        if (!res.ok) throw new Error(await res.text())
        const payload = (await res.json()) as { context: TrainingAiContext }
        setForm(contextToForm(payload.context))
        setUpdatedAt(payload.context.updated_at)
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Laden fehlgeschlagen.")
      } finally {
        setLoading(false)
      }
    })()
  }, [authResolved, trainerRole, accountRole])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaveSuccess(false)
    setSaveError("")
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError("")
    setSaveSuccess(false)
    setSaving(true)
    try {
      const res = await fetch("/api/admin/training-ai-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToBody(form)),
      })
      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { context: TrainingAiContext }
      setUpdatedAt(payload.context.updated_at)
      setSaveSuccess(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.")
    } finally {
      setSaving(false)
    }
  }

  if (!authResolved || loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Wird geladen…
      </div>
    )
  }

  const isAdmin = trainerRole === "admin" || accountRole === "admin"
  if (!isAdmin) {
    return <div className="py-12 text-center text-sm text-zinc-500">Kein Zugriff.</div>
  }

  return (
    <div className="space-y-6">
      {/* Titel */}
      <div>
        <h2 className="text-xl font-bold text-[#154c83] sm:text-2xl">KI-Basisprofil</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Zentrale Beschreibung des TSV BoxGyms – wird bei jeder KI-Trainingsplan-Generierung automatisch berücksichtigt.
        </p>
        {updatedAt && (
          <p className="mt-1 text-xs text-zinc-400">
            Zuletzt gespeichert:{" "}
            {new Date(updatedAt).toLocaleString("de-DE", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            Uhr
          </p>
        )}
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
        {/* ── Ausstattung ── */}
        <Card className="border-[#d0dff0]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#154c83]">Material &amp; Ausstattung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.has_ring}
                  onChange={(e) => setField("has_ring", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 accent-[#154c83]"
                />
                <span className="font-medium text-zinc-700">Ring vorhanden</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ring_often_available}
                  onChange={(e) => setField("ring_often_available", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 accent-[#154c83]"
                  disabled={!form.has_ring}
                />
                <span className={`font-medium ${form.has_ring ? "text-zinc-700" : "text-zinc-400"}`}>
                  Ring in der Regel verfügbar
                </span>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="kib-bags">Sandsäcke</Label>
                <Input
                  id="kib-bags"
                  type="number"
                  min={0}
                  max={50}
                  value={form.heavy_bags_count}
                  onChange={(e) => setField("heavy_bags_count", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kib-mitts">Pratzen-Paare</Label>
                <Input
                  id="kib-mitts"
                  type="number"
                  min={0}
                  max={50}
                  value={form.mitts_pairs_count}
                  onChange={(e) => setField("mitts_pairs_count", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kib-ropes">Springseile</Label>
                <Input
                  id="kib-ropes"
                  type="number"
                  min={0}
                  max={100}
                  value={form.jump_ropes_count}
                  onChange={(e) => setField("jump_ropes_count", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kib-medballs">Medizinbälle</Label>
                <Input
                  id="kib-medballs"
                  type="number"
                  min={0}
                  max={30}
                  value={form.medicine_balls_count}
                  onChange={(e) => setField("medicine_balls_count", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Raum & Kapazität ── */}
        <Card className="border-[#d0dff0]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#154c83]">Raum &amp; Kapazität</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5 sm:max-w-xs">
              <Label htmlFor="kib-maxgroup">Maximale Gruppengröße</Label>
              <Input
                id="kib-maxgroup"
                type="number"
                min={1}
                max={100}
                value={form.max_group_size}
                onChange={(e) => setField("max_group_size", e.target.value)}
              />
              <p className="text-xs text-zinc-500">
                Ab dieser Größe plant die KI automatisch Stationsbetrieb oder Rotationen ein.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kib-space">Raumcharakter / Platzverhältnisse</Label>
              <Textarea
                id="kib-space"
                placeholder="z. B. Große Sporthalle ca. 20×30 m, Matten eine Seite, Ring Mitte, 10 Sandsackplätze fest montiert…"
                value={form.space_description}
                onChange={(e) => setField("space_description", e.target.value)}
                className="min-h-[80px]"
                maxLength={1000}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Trainingsprinzipien ── */}
        <Card className="border-[#d0dff0]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#154c83]">Trainingsprinzipien</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="kib-principles">Leitlinien &amp; Vereinsphilosophie</Label>
              <Textarea
                id="kib-principles"
                placeholder={
                  "z. B. Technik hat Vorrang vor Kraft und Kondition. Sicherheit ist oberstes Gebot.\n" +
                  "Olympisches Boxen, kein Kickboxen oder MMA. Respektvolles Miteinander.\n" +
                  "Anfänger werden vor Vollkontakt geschützt. Lizenzpflicht für Wettkampfsparring."
                }
                value={form.training_principles}
                onChange={(e) => setField("training_principles", e.target.value)}
                className="min-h-[120px]"
                maxLength={2000}
              />
              <p className="text-xs text-zinc-500">
                Diese Prinzipien übersteuern alle anderen Instruktionen im KI-Prompt.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Gruppenrealität ── */}
        <Card className="border-[#d0dff0]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#154c83]">Gruppenrealität</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="kib-groups">Typische Gruppen &amp; Besonderheiten</Label>
              <Textarea
                id="kib-groups"
                placeholder={
                  "z. B. Boxzwerge (6–9 J.): sehr kurze Aufmerksamkeitsspanne, Spiele statt Drill. " +
                  "Basic Ü18: gemischte Vorerfahrung, viele Berufstätige. " +
                  "L-Gruppe: Wettkampforientiert, alle lizenziert oder kurz davor."
                }
                value={form.group_characteristics}
                onChange={(e) => setField("group_characteristics", e.target.value)}
                className="min-h-[120px]"
                maxLength={2000}
              />
            </div>
          </CardContent>
        </Card>

        {/* Feedback */}
        {saveError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
        )}
        {saveSuccess && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4 shrink-0" />
            Basisprofil gespeichert. Die KI nutzt diese Daten ab der nächsten Generierung.
          </div>
        )}

        <div className="flex items-center gap-3">
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
                Basisprofil speichern
              </>
            )}
          </Button>
          <Badge className="bg-[#e8f0fb] text-[#154c83]">
            <Brain className="mr-1 h-3 w-3" />
            Serverseitig in KI eingebunden
          </Badge>
        </div>
      </form>
    </div>
  )
}
