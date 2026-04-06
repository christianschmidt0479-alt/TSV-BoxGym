"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { MEMBER_PASSWORD_HINT, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, isValidMemberPassword } from "@/lib/memberPassword"

export function ZugangEinrichtenClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")?.trim() || ""

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!done) return
    const id = window.setTimeout(() => {
      router.push("/mein-bereich")
    }, 2000)
    return () => window.clearTimeout(id)
  }, [done, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const pw = password.trim()
    const conf = confirmPassword.trim()

    if (!pw) {
      setError("Bitte ein Passwort eingeben.")
      return
    }
    if (!isValidMemberPassword(pw)) {
      setError(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE)
      return
    }
    if (pw !== conf) {
      setError("Die beiden Passwörter stimmen nicht überein.")
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/public/member-area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_and_set_password",
          token,
          password: pw,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passwort konnte nicht gesetzt werden.")
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
        <div className="mx-auto max-w-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-3 shadow-sm">
            <div className="rounded-2xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white">Zugang einrichten</div>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link href="/mein-bereich">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zurück zum Login
              </Link>
            </Button>
          </div>
          <Card className="rounded-[24px] border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Dieser Link ist ungültig. Bitte wende dich an den Admin, um einen neuen Bestätigungslink anzufordern.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="rounded-2xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white">Zugang einrichten</div>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/mein-bereich">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück zum Login
            </Link>
          </Button>
        </div>

        <Card className="rounded-[24px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#154c83]" />
              E-Mail bestätigen &amp; Passwort festlegen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {done ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Deine E-Mail-Adresse wurde bestätigt und dein Passwort wurde gesetzt. Du wirst gleich zum Login weitergeleitet.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  Lege jetzt dein persönliches Passwort fest. Danach kannst du dich im Mitgliederbereich anmelden.
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
                ) : null}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Passwort wählen <span className="ml-1 text-red-500">*</span></Label>
                    <PasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Eigenes Passwort wählen"
                      className="rounded-2xl border-zinc-300 bg-white"
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-zinc-500">{MEMBER_PASSWORD_HINT}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Passwort bestätigen <span className="ml-1 text-red-500">*</span></Label>
                    <PasswordInput
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Passwort wiederholen"
                      className="rounded-2xl border-zinc-300 bg-white"
                      autoComplete="new-password"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-[#154c83] text-white hover:bg-[#1a5fa3]"
                  >
                    {loading ? "Wird gespeichert…" : "Passwort speichern & E-Mail bestätigen"}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
