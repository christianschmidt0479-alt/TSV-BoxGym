"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const NEUTRAL_SUCCESS_MESSAGE =
  "Wenn ein Trainerkonto existiert, wurde eine E-Mail zum Zuruecksetzen versendet."

export function TrainerForgotPasswordClient() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return

    try {
      setLoading(true)
      setError(null)
      setMessage(null)

      const response = await fetch("/api/public/trainer-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      })

      if (!response.ok) {
        const fallback = "Reset-Link konnte nicht angefordert werden. Bitte spaeter erneut versuchen."
        let nextError = fallback
        try {
          const payload = (await response.json()) as { message?: string }
          if (typeof payload.message === "string" && payload.message.trim()) {
            nextError = payload.message.trim()
          }
        } catch {
          // Ignore parse errors and keep fallback message.
        }
        throw new Error(nextError)
      }

      setMessage(NEUTRAL_SUCCESS_MESSAGE)
      setEmail("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset-Link konnte nicht angefordert werden.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="rounded-2xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white">Trainer-Passwort vergessen</div>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/trainer-zugang">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurueck zum Login
            </Link>
          </Button>
        </div>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Passwort zuruecksetzen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {message ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {message}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            {!message ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  Gib die E-Mail-Adresse deines Trainerkontos ein.
                </div>

                <div className="space-y-2">
                  <Label htmlFor="trainer-email">E-Mail</Label>
                  <Input
                    id="trainer-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trainer@email.de"
                    required
                    className="rounded-xl"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-[#154c83] text-white hover:bg-[#123d69]"
                >
                  {loading ? "Wird gesendet..." : "Reset-Link senden"}
                </Button>
              </form>
            ) : (
              <div className="text-center">
                <Button asChild variant="outline" className="rounded-2xl">
                  <Link href="/trainer-zugang">Zurueck zum Login</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
