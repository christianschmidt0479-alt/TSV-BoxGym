"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import LoginCard from "@/components/LoginCard"

export default function MemberLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const reason = searchParams?.get("reason")
  const showSessionExpired =
    typeof reason === "string" && reason === "session_expired"

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    try {
      const res = await fetch("/api/public/member-area", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "member_login",
          email,
          pin: password,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setError(data?.error || "Login fehlgeschlagen")
        return
      }

      const redirectTo = "/mein-bereich/dashboard"
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
    <LoginCard title="Mein Bereich" error={error}>
      <form onSubmit={handleLogin} className="space-y-4">
        {showSessionExpired ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Du wurdest aus Sicherheitsgründen ausgeloggt.
          </div>
        ) : null}

        <div>
          <label className="block text-sm font-medium text-zinc-900">E-Mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-900">Passwort</label>
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

        <p className="text-center text-sm text-zinc-500">
          <Link
            href="/mein-bereich/passwort-vergessen"
            className="text-[#154c83] hover:underline"
          >
            Passwort vergessen?
          </Link>
        </p>
      </form>
    </LoginCard>
  )
}
