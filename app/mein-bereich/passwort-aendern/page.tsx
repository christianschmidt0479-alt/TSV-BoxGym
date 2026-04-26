"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import LoginCard from "@/components/LoginCard"

export default function ChangeMemberPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSuccess("")

    const trimmedPassword = password.trim()
    const trimmedConfirmPassword = confirmPassword.trim()

    if (trimmedPassword.length < 6) {
      setError("Passwort muss mindestens 6 Zeichen lang sein.")
      return
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setError("Die beiden Passwörter stimmen nicht überein.")
      return
    }

    try {
      setSaving(true)
      const response = await fetch("/api/member/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: trimmedPassword, confirmPassword: trimmedConfirmPassword }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.ok) {
        setError(data?.error || "Passwort konnte nicht geändert werden.")
        return
      }

      setSuccess("Passwort gespeichert. Du wirst weitergeleitet.")
      router.push("/mein-bereich")
      router.refresh()
    } catch {
      setError("Passwort konnte nicht geändert werden.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <LoginCard title="Passwort ändern" error={error}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-zinc-600">
          Aus Sicherheitsgründen musst du dein Passwort aktualisieren. Das neue Passwort braucht mindestens 6 Zeichen.
        </p>

        <div>
          <label className="block text-sm font-medium text-zinc-900">Neues Passwort</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-900">Passwort wiederholen</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-12 rounded-xl bg-[#154c83] hover:bg-[#123d69] transition text-white font-medium disabled:opacity-60"
        >
          {saving ? "Speichert..." : "Passwort speichern"}
        </button>
      </form>
    </LoginCard>
  )
}
