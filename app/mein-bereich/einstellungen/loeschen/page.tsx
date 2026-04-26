"use client"

import { useState } from "react"

export default function LoeschenPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDeletionRequest() {
    try {
      setLoading(true)
      setMessage(null)
      setError(null)

      const response = await fetch("/api/member/request-deletion", {
        method: "POST",
      })

      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!response.ok || !result?.ok) {
        throw new Error("Löschantrag konnte nicht gesendet werden.")
      }

      setMessage("Dein Löschantrag wurde erfolgreich übermittelt.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschantrag konnte nicht gesendet werden.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center px-4 pt-10">
      <div className="w-full max-w-md space-y-6 text-center">

        <h1 className="text-xl font-semibold text-red-600">
          Account löschen
        </h1>

        <p className="text-sm text-gray-600">
          Dein Account wird nicht sofort gelöscht.
          Der Verein prüft deine Anfrage.
        </p>

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <button
          className="w-full border border-red-300 text-red-600 py-2 rounded-md text-sm disabled:opacity-60"
          type="button"
          onClick={() => void handleDeletionRequest()}
          disabled={loading}
        >
          {loading ? "Wird gesendet..." : "Löschung beantragen"}
        </button>

      </div>
    </div>
  )
}
