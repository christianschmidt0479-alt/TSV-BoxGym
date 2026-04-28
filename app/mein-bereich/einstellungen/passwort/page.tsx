"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { MemberAreaBrandHeader } from "@/components/member-area/MemberAreaBrandHeader"
import { FormContainer } from "@/components/ui/form-container"
import { Button } from "@/components/ui/button"

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
    <FormContainer
      title="Passwort zurücksetzen"
      description="Du erhältst eine E-Mail zum Zurücksetzen deines Passworts."
    >
      <div className="space-y-5">
        <MemberAreaBrandHeader
          title="Passwort ändern"
          subtitle="Sende dir einen sicheren Reset-Link per E-Mail"
          actionSlot={
            <Link
              href="/mein-bereich/einstellungen"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/40 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20"
            >
              Zurück
            </Link>
          }
        />

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Wir senden den Reset-Link an die E-Mail-Adresse deines Mitgliederkontos.
        </div>

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 text-left">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800 text-left">
            {error}
          </div>
        ) : null}

        <Button
          className="h-14 w-full rounded-2xl bg-[#154c83] text-base font-semibold text-white hover:bg-[#123d69] disabled:opacity-60"
          type="button"
          onClick={() => void handleSendResetMail()}
          disabled={loading}
        >
          {loading ? "Sendet..." : "E-Mail senden"}
        </Button>
      </div>
    </FormContainer>
  )
}
