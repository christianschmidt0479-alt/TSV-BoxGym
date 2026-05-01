"use client"

import { useState } from "react"

type TrainerSelfCheckinButtonProps = {
  memberId: string
}

export default function TrainerSelfCheckinButton({ memberId }: TrainerSelfCheckinButtonProps) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [success, setSuccess] = useState(false)

  async function handleSelfCheckin() {
    setLoading(true)
    setMessage("")
    setSuccess(false)

    try {
      const response = await fetch("/api/public/member-checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "trainer",
          memberId,
        }),
      })

      const raw = await response.text()
      let data: {
        ok?: boolean
        error?: string
        reason?: string
      } = {}
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {}
      } catch {
        data = {}
      }

      if (!response.ok || !data.ok) {
        setMessage(data.error || raw || "Selbst-Check-in fehlgeschlagen")
        return
      }

      setSuccess(true)
      setMessage("Selbst-Check-in erfolgreich")
    } catch {
      setMessage("Selbst-Check-in fehlgeschlagen")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSelfCheckin}
        disabled={loading}
        className="rounded-xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#123f6d] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Prüfe..." : "Selbst einchecken"}
      </button>

      {message ? (
        <div className={`text-sm ${success ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </div>
      ) : null}
    </div>
  )
}
