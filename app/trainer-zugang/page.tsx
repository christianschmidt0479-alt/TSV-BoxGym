"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import LoginCard from "@/components/LoginCard"

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

      router.push(data?.redirectTo || "/trainer")
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
        <div>
          <label className="block text-sm font-medium text-zinc-900">
            E-Mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-900">
            Passwort
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full h-12 rounded-xl bg-[#154c83] hover:bg-[#123d69] transition text-white font-medium"
        >
          Einloggen
        </button>
      </form>
    </LoginCard>
  )
}
