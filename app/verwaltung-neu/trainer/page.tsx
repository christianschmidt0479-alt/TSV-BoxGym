"use client"

import { useState, useEffect, useCallback } from "react"
import { container, pageTitle } from "@/lib/ui"
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

  const loadTrainers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/get-trainers", {
        method: "POST",
        credentials: "include",
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
    void loadTrainers()

    return () => {
    }
  }, [loadTrainers])

  return (
    <div style={container}>
      <div style={pageTitle}>Trainer</div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Lade Trainer…</p>
      ) : (
        <TrainerListClient trainers={trainers} onReload={loadTrainers} />
      )}
    </div>
  )
}
