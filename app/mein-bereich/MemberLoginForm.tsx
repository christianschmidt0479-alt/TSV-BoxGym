"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ErrorBox } from "@/components/ErrorBox"
import { MemberAreaBrandHeader } from "@/components/member-area/MemberAreaBrandHeader"
import { Button } from "@/components/ui/button"
import { FormContainer } from "@/components/ui/form-container"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"

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
          password,
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
    <FormContainer rootClassName="!min-h-[calc(100svh-12rem)] !py-3 md:!py-5">
      <div className="space-y-4 sm:space-y-5">
        <MemberAreaBrandHeader
          title="Willkommen zurück"
          subtitle=""
        />

        <form onSubmit={handleLogin} className="space-y-3 sm:space-y-4">
          <ErrorBox message={error} />

        {showSessionExpired ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Du wurdest aus Sicherheitsgründen ausgeloggt.
          </div>
        ) : null}

          <div className="space-y-2">
            <Label>E-Mail</Label>
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
            <Label>Passwort</Label>
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
            className="h-14 w-full rounded-2xl bg-[#154c83] text-base font-semibold text-white hover:bg-[#123d69]"
          >
            Einloggen
          </Button>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-center">
            <p className="text-sm text-zinc-600">
              <Link
                href="/mein-bereich/passwort-vergessen"
                className="font-medium text-[#154c83] hover:underline"
              >
                Passwort vergessen?
              </Link>
            </p>
          </div>
        </form>
      </div>
    </FormContainer>
  )
}
