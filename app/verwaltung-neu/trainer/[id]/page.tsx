"use client"

import { useState, useEffect, useCallback } from "react"
import { container, pageTitle, card, cardTitle, buttonSecondary } from "@/lib/ui"

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

  if (loading) return <div style={container}><p>Lade Trainer…</p></div>
  if (error || !trainer) return (
    <div style={container}>
      <div style={{ color: "#dc2626" }}>{error || "Trainer nicht gefunden."}</div>
      <a href="/verwaltung-neu/trainer" style={{ color: "#2563eb", fontSize: 14 }}>← Zurück</a>
    </div>
  )

  const fullName = `${trainer.first_name || ""} ${trainer.last_name || ""}`.trim() || "Unbekannt"

  return (
    <div style={container}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <a href="/verwaltung-neu/trainer" style={{ color: "#2563eb", fontSize: 14 }}>← Trainer</a>
      </div>

      <div style={pageTitle}>{fullName}</div>

      <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
        <div style={{ ...card, display: "grid", gap: 12 }}>
          <div style={cardTitle}>Stammdaten</div>

          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <div><strong>E-Mail:</strong> {trainer.email || "—"}</div>
            <div>
              <strong>E-Mail-Status:</strong>{" "}
              {trainer.email_verified
                ? <span style={{ color: "#15803d" }}>bestätigt</span>
                : <span style={{ color: "#dc2626" }}>nicht bestätigt</span>}
            </div>
            <div>
              <strong>Freigabe:</strong>{" "}
              {trainer.is_approved
                ? <span style={{ color: "#15803d" }}>aktiv</span>
                : <span style={{ color: "#dc2626" }}>nicht freigegeben</span>}
            </div>
            <div>
              <strong>Verknüpftes Mitglied:</strong>{" "}
              {trainer.linked_member_id
                ? <span style={{ color: "#15803d" }}>verknüpft ({trainer.linked_member_id.slice(0, 8)}…)</span>
                : <span style={{ color: "#6b7280" }}>keine Verknüpfung</span>}
            </div>
            {trainer.birthdate && (
              <div>
                <strong>Geburtsdatum:</strong>{" "}
                {new Date(trainer.birthdate).toLocaleDateString("de-DE")}
              </div>
            )}
          </div>
        </div>

        <div style={{ ...card, display: "grid", gap: 12 }}>
          <div style={cardTitle}>Lizenz</div>

          <div style={{ display: "grid", gap: 8 }}>
            <input
              type="text"
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="z.B. Übungsleiter DOSB C"
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 14,
                width: "100%",
                boxSizing: "border-box",
              }}
            />

            {saveError && (
              <div style={{ color: "#dc2626", fontSize: 13 }}>{saveError}</div>
            )}
            {saveSuccess && (
              <div style={{ color: "#15803d", fontSize: 13, fontWeight: 600 }}>✓ Gespeichert</div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...buttonSecondary,
                opacity: saving ? 0.6 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Speichert…" : "Lizenz speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
