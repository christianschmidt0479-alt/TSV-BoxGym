"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import LoginCard from "@/components/LoginCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"

export default function TrainerLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    try {
      const res = await fetch("/api/trainer-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setError(data?.error || "Login fehlgeschlagen")
        return
      }

      if (data?.role === "admin") {
        const redirectTo = "/verwaltung-neu"
        router.replace(redirectTo)
        router.refresh()
        return
      }

      if (data?.role === "trainer") {
        const redirectTo = "/trainer"
        router.replace(redirectTo)
        router.refresh()
        return
      }

      const redirectTo = data?.redirectTo || "/trainer"
      router.replace(redirectTo)
      router.refresh()
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error(err)
      }
      setError("Verbindung fehlgeschlagen")
    }
  }

  return (
    <LoginCard title="Trainer / Admin Login" error={error}>
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label>
            E-Mail
          </Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-14 rounded-2xl border-zinc-300 bg-white text-lg text-zinc-900"
            autoComplete="username"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>
            Passwort
          </Label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-14 rounded-2xl border-zinc-300 bg-white text-lg text-zinc-900"
            autoComplete="current-password"
            required
          />
        </div>

        <Button
          type="submit"
          className="h-16 w-full rounded-2xl bg-[#154c83] text-xl font-semibold text-white hover:bg-[#123d69]"
        >
          Einloggen
        </Button>
      </form>
    </LoginCard>
  )
}
