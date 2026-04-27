"use client"

import { useState } from "react"

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
    return <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">Keine Trainer vorhanden</div>
  }

  return (
    <div className="space-y-3">
      {trainers.map((trainer) => (
        <div key={trainer.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{trainerName(trainer)}</div>
              <div className="text-xs text-zinc-500">{trainer.email || "Keine E-Mail"}</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {trainer.linked_member_id ? "Trainer + Mitglied" : "Nur Trainer"}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Trainer</span>
              {trainer.linked_member_id && (
                <span className="inline-flex items-center rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Mitglied</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-700">
            <div><strong>Lizenz:</strong> {trainer.trainer_license || "Keine Lizenz hinterlegt"}</div>
            <div><strong>Status:</strong> {trainerStatus(trainer)}</div>
            <div>
              <strong>E-Mail:</strong>{" "}
              <span className={trainer.email_verified ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>
                {trainer.email_verified ? "bestätigt" : "nicht bestätigt"}
              </span>
            </div>
          </div>

          {trainer.birthdate ? (
            <div className="text-xs text-zinc-600">Geburtsdatum: {new Date(trainer.birthdate).toLocaleDateString("de-DE")}</div>
          ) : (
            <div className="text-xs text-red-600 font-semibold">Geburtsdatum fehlt</div>
          )}

          {!trainer.linked_member_id && (
            <div className="text-xs text-red-600 font-semibold">Profil unvollständig</div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {trainer.linked_member_id && (
              <button
                onClick={() => handleUnlink(trainer.id)}
                disabled={loadingId === trainer.id}
                className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-400 disabled:opacity-60"
              >
                {loadingId === trainer.id ? "Lädt…" : "Verknüpfung lösen"}
              </button>
            )}
            <a
              href={`/verwaltung-neu/trainer/${trainer.id}`}
              className="text-xs font-semibold text-blue-600 underline hover:text-blue-800"
            >
              Details →
            </a>
          </div>

          {successId === trainer.id + "-unlink" && (
            <div className="text-xs font-semibold text-amber-800">✓ Verknüpfung gelöst</div>
          )}
        </div>
      ))}
    </div>
  )
}
