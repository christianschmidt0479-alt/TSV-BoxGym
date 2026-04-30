"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ErrorBox } from "@/components/ErrorBox"
import { MemberAreaBrandHeader } from "@/components/member-area/MemberAreaBrandHeader"
import { Button } from "@/components/ui/button"
import { FormContainer } from "@/components/ui/form-container"
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
    <FormContainer rootClassName="!min-h-[calc(100svh-12rem)] !py-3 md:!py-5">
      <div className="space-y-4 sm:space-y-5">
        <MemberAreaBrandHeader
          title="Trainer / Admin Login"
          subtitle=""
        />

        <form onSubmit={handleLogin} className="space-y-3 sm:space-y-4">
          <ErrorBox message={error} />

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
            <div className="text-right">
              <Link
                href="/trainer-zugang/passwort-vergessen"
                className="text-sm font-semibold text-[#154c83] underline decoration-[#154c83]/40 underline-offset-2 hover:decoration-[#154c83]"
              >
                Passwort vergessen?
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            className="h-14 w-full rounded-2xl bg-[#154c83] text-base font-semibold text-white hover:bg-[#123d69]"
          >
            Einloggen
          </Button>
        </form>
      </div>
    </FormContainer>
  )
}
