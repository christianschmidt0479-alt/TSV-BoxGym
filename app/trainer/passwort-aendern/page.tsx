"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Eye, EyeOff } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TRAINER_PIN_HINT, TRAINER_PIN_REGEX } from "@/lib/trainerPin"

export default function TrainerPasswortAendernPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!TRAINER_PIN_REGEX.test(newPassword)) {
      setError(TRAINER_PIN_HINT)
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/trainer/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      })

      if (!res.ok) {
        const msg = await res.text()
        setError(msg || "Fehler beim Speichern. Bitte erneut versuchen.")
        return
      }

      router.replace("/trainer")
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#154c83]">
            <KeyRound className="h-5 w-5" />
            Neues Passwort wählen
          </CardTitle>
          <p className="text-sm text-zinc-500">
            Dein Konto wurde zurückgesetzt. Bitte wähle jetzt ein persönliches Passwort.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Neues Passwort</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <p className="text-xs text-zinc-400">{TRAINER_PIN_HINT}</p>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Wird gespeichert…" : "Passwort speichern"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
