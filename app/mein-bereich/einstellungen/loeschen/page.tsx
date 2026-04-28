"use client"

import { useState } from "react"
import Link from "next/link"
import { MemberAreaBrandHeader } from "@/components/member-area/MemberAreaBrandHeader"
import { FormContainer } from "@/components/ui/form-container"
import { Button } from "@/components/ui/button"

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
    <FormContainer
      title="Account löschen"
      description="Dein Account wird nicht sofort gelöscht. Der Verein prüft deine Anfrage."
    >
      <div className="space-y-5">
        <MemberAreaBrandHeader
          title="Konto löschen"
          subtitle="Sende eine Anfrage zur Prüfung durch den Verein"
          actionSlot={
            <Link
              href="/mein-bereich/einstellungen"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/40 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20"
            >
              Zurück
            </Link>
          }
        />

        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Die Löschung wird als Antrag verarbeitet und manuell geprüft.
        </div>

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <Button
          className="h-14 w-full rounded-2xl border border-red-300 bg-white text-base font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          type="button"
          onClick={() => void handleDeletionRequest()}
          disabled={loading}
        >
          {loading ? "Wird gesendet..." : "Löschung beantragen"}
        </Button>
      </div>
    </FormContainer>
  )
}
