"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { MEMBER_PASSWORD_HINT, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, isValidMemberPassword } from "@/lib/memberPassword"

export function PasswordResetClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")?.trim() || ""
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenChecked, setTokenChecked] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resetCompleted, setResetCompleted] = useState(false)

  useEffect(() => {
    if (!token) {
      setTokenChecked(true)
      setTokenValid(false)
      return
    }

    let cancelled = false

    void (async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/public/member-password-reset?token=${encodeURIComponent(token)}`)
        const result = (await response.json()) as { valid?: boolean; email?: string; message?: string }

        if (cancelled) return

        if (!response.ok || result.valid !== true) {
          setTokenValid(false)
          setError(result.message || "Reset-Link ist ungültig oder abgelaufen.")
          return
        }

        setTokenValid(true)
        setEmail(result.email || "")
      } catch (nextError) {
        if (cancelled) return
        console.error(nextError)
        setTokenValid(false)
        setError("Reset-Link konnte nicht geprüft werden.")
      } finally {
        if (!cancelled) {
          setTokenChecked(true)
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!resetCompleted) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      router.push("/mein-bereich")
    }, 1800)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [resetCompleted, router])

  async function requestResetLink() {
    try {
      setLoading(true)
      setError(null)
      setMessage(null)
      setResetCompleted(false)

      const response = await fetch("/api/public/member-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request",
          email,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const result = (await response.json()) as { message?: string }
      setMessage(result.message || "Wenn ein passendes Mitglied existiert, wurde ein Reset-Link versendet.")
    } catch (nextError) {
      console.error(nextError)
      setError(nextError instanceof Error ? nextError.message : "Reset-Link konnte nicht angefordert werden.")
    } finally {
      setLoading(false)
    }
  }

  async function confirmReset() {
    const password = newPassword.trim()
    const confirmation = confirmPassword.trim()

    if (!isValidMemberPassword(password)) {
      setError(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE)
      return
    }

    if (password !== confirmation) {
      setError("Die beiden Passwörter stimmen nicht überein.")
      return
    }

    try {
      setLoading(true)
      setError(null)
      setMessage(null)
      setResetCompleted(false)

      const response = await fetch("/api/public/member-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          token,
          newPassword: password,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      setMessage("Dein Passwort wurde aktualisiert. Du wirst gleich zum Mitglieder-Login weitergeleitet.")
      setNewPassword("")
      setConfirmPassword("")
      setResetCompleted(true)
    } catch (nextError) {
      console.error(nextError)
      setError(nextError instanceof Error ? nextError.message : "Passwort konnte nicht gesetzt werden.")
      setResetCompleted(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="rounded-2xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white">Passwort zurücksetzen</div>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/mein-bereich">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück zum Login
            </Link>
          </Button>
        </div>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle>{token ? "Neues Passwort setzen" : "Reset-Link anfordern"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {message ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
            ) : null}

            {!token ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  Gib die E-Mail-Adresse deines Mitgliedskontos ein. Wenn ein passendes Mitglied mit bestätigter E-Mail existiert, senden wir einen Reset-Link.
                </div>

                <div className="space-y-2">
                  <Label>E-Mail</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@tsv-falkensee.de"
                      className="rounded-2xl border-zinc-300 bg-white pl-10 text-zinc-900"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                  disabled={loading}
                  onClick={() => {
                    void requestResetLink()
                  }}
                >
                  {loading ? "Sendet..." : "Reset-Link per E-Mail senden"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4" />
                    Passwort neu setzen
                  </div>
                  <div className="mt-2">
                    {tokenChecked && tokenValid && email ? `Mitgliedskonto: ${email}` : "Der Link wird geprüft."}
                  </div>
                </div>

                {tokenChecked && tokenValid ? (
                  <>
                    <div className="space-y-2">
                      <Label>Neues Passwort</Label>
                      <PasswordInput
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="Neues Passwort"
                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Passwort wiederholen</Label>
                      <PasswordInput
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Passwort wiederholen"
                        className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                      />
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      {MEMBER_PASSWORD_HINT}
                    </div>

                    <Button
                      type="button"
                      className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                      disabled={loading}
                      onClick={() => {
                        void confirmReset()
                      }}
                    >
                      {loading ? "Speichert..." : "Passwort speichern"}
                    </Button>
                  </>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}