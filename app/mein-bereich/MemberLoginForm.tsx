"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import LoginCard from "@/components/LoginCard"

export default function MemberLoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

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
          password,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setError(data?.error || "E-Mail oder Passwort falsch")
        return
      }

      router.push("/mein-bereich/dashboard")
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
      </form>
    </LoginCard>
  )
}
