"use client"

import { useState } from "react"
import { card, cardTitle } from "@/lib/ui"

type TrainerRow = {
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

function trainerName(trainer: TrainerRow) {
  return `${trainer.first_name || ""} ${trainer.last_name || ""}`.trim() || "Unbekannt"
}

function trainerStatus(trainer: TrainerRow) {
  return trainer.is_approved ? "Aktiv" : "Nicht freigegeben"
}

export default function TrainerListClient({
  trainers,
  onReload,
}: {
  trainers: TrainerRow[]
  onReload: () => void
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)

  async function handleUnlink(trainerId: string) {
    if (!confirm("Verknüpfung mit Mitglied wirklich lösen?")) return
    setLoadingId(trainerId)
    try {
      const res = await fetch("/api/admin/unlink-trainer-member", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainerId }),
      })
      if (!res.ok) {
        const result = await res.json()
        alert(result.error || "Fehler beim Lösen der Verknüpfung.")
        setLoadingId(null)
        return
      }
      setSuccessId(trainerId + "-unlink")
      setTimeout(() => setSuccessId(null), 3000)
      onReload()
    } catch {
      alert("Netzwerkfehler.")
    }
    setLoadingId(null)
  }

  if (trainers.length === 0) {
    return <p>Keine Trainer vorhanden</p>
  }

  return (
    <>
    <div style={{ display: "grid", gap: 16 }}>
      {trainers.map((trainer) => (
        <div key={trainer.id} style={{ ...card, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={cardTitle}>{trainerName(trainer)}</div>
              <div style={{ fontSize: 14, color: "#64748b" }}>{trainer.email || "Keine E-Mail"}</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                {trainer.linked_member_id ? "Trainer + Mitglied" : "Nur Trainer"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: 4,
                  padding: "2px 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "#dbeafe",
                  color: "#1d4ed8",
                }}
              >
                Trainer
              </span>
              {trainer.linked_member_id && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "#dcfce7",
                    color: "#15803d",
                  }}
                >
                  Mitglied
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, fontSize: 14 }}>
            <div>
              <strong>Lizenz:</strong> {trainer.trainer_license || "Keine Lizenz hinterlegt"}
            </div>
            <div>
              <strong>Status:</strong> {trainerStatus(trainer)}
            </div>
            <div>
              <strong>E-Mail:</strong> {trainer.email_verified ? "bestätigt" : "nicht bestätigt"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {trainer.email_verified ? (
              <span style={{ color: "#15803d", fontWeight: 600 }}>E-Mail bestätigt</span>
            ) : (
              <span style={{ color: "#dc2626", fontWeight: 600 }}>E-Mail nicht bestätigt</span>
            )}
          </div>

          {trainer.birthdate ? (
            <div style={{ fontSize: 14, color: "#4b5563" }}>
              Geburtsdatum: {new Date(trainer.birthdate).toLocaleDateString("de-DE")}
            </div>
          ) : (
            <div style={{ fontSize: 14, color: "#ef4444" }}>
              Geburtsdatum fehlt
            </div>
          )}

          {!trainer.linked_member_id && (
            <div style={{ fontSize: 14, color: "#ef4444" }}>
              Profil unvollstaendig
            </div>
          )}

          {trainer.linked_member_id && (
            <button
              onClick={() => handleUnlink(trainer.id)}
              disabled={loadingId === trainer.id}
              style={{
                alignSelf: "flex-start",
                background: "none",
                border: "1px solid #fca5a5",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 13,
                cursor: loadingId === trainer.id ? "not-allowed" : "pointer",
                color: "#dc2626",
                opacity: loadingId === trainer.id ? 0.6 : 1,
              }}
            >
              {loadingId === trainer.id ? "Lädt…" : "Verknüpfung lösen"}
            </button>
          )}

          <a
            href={`/verwaltung-neu/trainer/${trainer.id}`}
            style={{
              alignSelf: "flex-start",
              fontSize: 13,
              color: "#2563eb",
              textDecoration: "underline",
            }}
          >
            Details →
          </a>

          {successId === trainer.id + "-unlink" && (
            <div style={{ fontSize: 13, color: "#92400e", fontWeight: 600 }}>
              ✓ Verknüpfung gelöst
            </div>
          )}
        </div>
      ))}
    </div>
    </>
  )
}
