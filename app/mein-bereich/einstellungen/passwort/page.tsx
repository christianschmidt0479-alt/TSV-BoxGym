"use client"

import { useEffect, useState } from "react"

export default function PasswortPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadEmail() {
      try {
        const response = await fetch("/api/public/member-area", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "member_session" }),
        })
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; member?: Record<string, unknown> } | null
        if (!response.ok || !payload?.ok) return
        const nextEmail = typeof payload.member?.email === "string" ? payload.member.email : ""
        if (active) setEmail(nextEmail)
      } catch {
        // optional preload only
      }
    }

    void loadEmail()
    return () => {
      active = false
    }
  }, [])

  async function handleSendResetMail() {
    try {
      setLoading(true)
      setError(null)
      setMessage(null)

      const trimmedEmail = email.trim()
      if (!trimmedEmail) {
        throw new Error("Keine E-Mail-Adresse in der Session gefunden.")
      }

      const response = await fetch("/api/public/member-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email: trimmedEmail }),
      })
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string } | null
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Reset-Mail konnte nicht gesendet werden.")
      }

      setMessage(result.message || "Wenn ein passendes Mitglied existiert, wurde ein Reset-Link versendet.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset-Mail konnte nicht gesendet werden.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center px-4 pt-10">
      <div className="w-full max-w-md space-y-6 text-center">

        <h1 className="text-xl font-semibold">
          Passwort zurücksetzen
        </h1>

        <p className="text-sm text-gray-600">
          Du erhältst eine E-Mail zum Zurücksetzen deines Passworts.
        </p>

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 text-left">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 text-left">
            {error}
          </div>
        ) : null}

        <button
          className="w-full bg-[#0f2a44] text-white py-2 rounded-md text-sm disabled:opacity-60"
          type="button"
          onClick={() => void handleSendResetMail()}
          disabled={loading}
        >
          {loading ? "Sendet..." : "E-Mail senden"}
        </button>

      </div>
    </div>
  )
}
