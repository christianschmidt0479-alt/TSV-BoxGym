"use client"

import { useState, useEffect, useCallback } from "react"


type TrainerDetail = {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  trainer_license?: string | null
  is_approved?: boolean | null
  email_verified?: boolean | null
  linked_member_id?: string | null
  birthdate?: string | null
}

export default function TrainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [trainer, setTrainer] = useState<TrainerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [license, setLicense] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [id, setId] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  const loadTrainer = useCallback(async (trainerId: string) => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/get-trainers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainerId,
          includeMemberBirthdate: true,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(result.error || "Fehler beim Laden.")
        setLoading(false)
        return
      }
      const found = (result.trainers as TrainerDetail[]).find((t) => t.id === trainerId) ?? null
      setTrainer(found)
      setLicense(found?.trainer_license ?? "")
      setError(found ? null : "Trainer nicht gefunden.")
    } catch {
      setError("Netzwerkfehler.")
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (id) void loadTrainer(id)
  }, [id, loadTrainer])

  async function handleSave() {
    if (!trainer) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch("/api/admin/update-trainer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainerId: trainer.id, trainer_license: license }),
      })
      if (!res.ok) {
        const result = await res.json()
        setSaveError(result.error || "Fehler beim Speichern.")
        setSaving(false)
        return
      }
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      await loadTrainer(trainer.id)
    } catch {
      setSaveError("Netzwerkfehler.")
    }
    setSaving(false)
  }

  if (loading) return <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">Lade Trainer…</div>
  if (error || !trainer) return (
    <div className="space-y-3">
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "Trainer nicht gefunden."}</div>
      <a href="/verwaltung-neu/trainer" className="text-sm font-semibold text-blue-600 underline hover:text-blue-800">← Zurück</a>
    </div>
  )

  const fullName = `${trainer.first_name || ""} ${trainer.last_name || ""}`.trim() || "Unbekannt"

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/verwaltung-neu/trainer" className="text-sm font-semibold text-blue-600 underline hover:text-blue-800">← Trainer</a>
        <span className="text-base font-semibold text-zinc-900">{fullName}</span>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-3">
        <div className="text-sm font-semibold text-zinc-900">Stammdaten</div>
        <div className="grid gap-2 text-xs text-zinc-700">
          <div><strong>E-Mail:</strong> {trainer.email || "—"}</div>
          <div>
            <strong>E-Mail-Status:</strong>{" "}
            {trainer.email_verified
              ? <span className="font-semibold text-emerald-700">bestätigt</span>
              : <span className="font-semibold text-red-700">nicht bestätigt</span>}
          </div>
          <div>
            <strong>Freigabe:</strong>{" "}
            {trainer.is_approved
              ? <span className="font-semibold text-emerald-700">aktiv</span>
              : <span className="font-semibold text-red-700">nicht freigegeben</span>}
          </div>
          <div>
            <strong>Verknüpftes Mitglied:</strong>{" "}
            {trainer.linked_member_id
              ? <span className="font-semibold text-emerald-700">verknüpft ({trainer.linked_member_id.slice(0, 8)}…)</span>
              : <span className="text-zinc-500">keine Verknüpfung</span>}
          </div>
          {trainer.birthdate && (
            <div>
              <strong>Geburtsdatum:</strong>{" "}
              {new Date(trainer.birthdate).toLocaleDateString("de-DE")}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-3">
        <div className="text-sm font-semibold text-zinc-900">Lizenz</div>
        <div className="space-y-2">
          <input
            type="text"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            placeholder="z.B. Übungsleiter DOSB C"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
          {saveError && (
            <div className="text-xs font-semibold text-red-700">{saveError}</div>
          )}
          {saveSuccess && (
            <div className="text-xs font-semibold text-emerald-700">✓ Gespeichert</div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 disabled:opacity-60"
          >
            {saving ? "Speichert…" : "Lizenz speichern"}
          </button>
        </div>
      </div>
    </div>
  )
}
