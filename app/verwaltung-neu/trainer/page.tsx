"use client"

import { useState, useEffect, useCallback } from "react"

import TrainerListClient from "./TrainerListClient"

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

export default function TrainerPage() {
  const [trainers, setTrainers] = useState<TrainerRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadTrainers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/get-trainers", {
        method: "POST",
        credentials: "include",
        signal,
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error || "Fehler beim Laden der Trainer.")
        setTrainers([])
        setLoading(false)
        return
      }

      const nextTrainers = Array.isArray(result.trainers) ? result.trainers : []
      setTrainers(nextTrainers)
      setError(null)
      setLoading(false)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return
      }
      console.error(err)
      setError("Netzwerkfehler beim Laden der Trainer.")
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void loadTrainers(controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadTrainers])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="text-base font-semibold text-zinc-900">Trainer</div>
        <div className="text-sm text-zinc-600">Trainerverwaltung und Verknüpfungen</div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600 shadow-sm">Lade Trainer…</div>
      ) : (
        <TrainerListClient trainers={trainers} onReload={loadTrainers} />
      )}
    </div>
  )
}
