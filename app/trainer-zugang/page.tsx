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
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestFirstName, setRequestFirstName] = useState("")
  const [requestLastName, setRequestLastName] = useState("")
  const [requestEmail, setRequestEmail] = useState("")
  const [requestPhone, setRequestPhone] = useState("")
  const [requestGender, setRequestGender] = useState("")
  const [requestBirthdate, setRequestBirthdate] = useState("")
  const [requestDosbLicense, setRequestDosbLicense] = useState("Keine / noch nicht vorhanden")
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError] = useState("")
  const [requestSuccess, setRequestSuccess] = useState("")
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

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault()
    setRequestError("")
    setRequestSuccess("")

    try {
      setRequestLoading(true)
      const res = await fetch("/api/public/trainer-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "request_access",
          firstName: requestFirstName,
          lastName: requestLastName,
          email: requestEmail,
          phone: requestPhone,
          gender: requestGender,
          birthdate: requestBirthdate,
          dosbLicense: requestDosbLicense,
        }),
      })

      const text = await res.text()
      const fallbackMessage = "Anfrage konnte nicht gesendet werden. Bitte später erneut versuchen."

      if (!res.ok) {
        setRequestError(text || fallbackMessage)
        return
      }

      setRequestSuccess("Anfrage wurde gesendet. Der Zugang wird nach Prüfung freigeschaltet.")
      setRequestFirstName("")
      setRequestLastName("")
      setRequestEmail("")
      setRequestPhone("")
      setRequestGender("")
      setRequestBirthdate("")
      setRequestDosbLicense("Keine / noch nicht vorhanden")
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error(err)
      }
      setRequestError("Anfrage konnte nicht gesendet werden. Bitte später erneut versuchen.")
    } finally {
      setRequestLoading(false)
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
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setShowRequestForm((prev) => !prev)
                  setRequestError("")
                  setRequestSuccess("")
                }}
                className="text-xs font-medium text-zinc-600 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-800"
              >
                Trainer-Zugang beantragen
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="h-14 w-full rounded-2xl bg-[#154c83] text-base font-semibold text-white hover:bg-[#123d69]"
          >
            Einloggen
          </Button>
        </form>

        {showRequestForm && (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
            <p className="mb-3 text-sm font-semibold text-zinc-900">Trainer-Zugang beantragen</p>
            <p className="mb-4 text-xs text-zinc-600">
              Der Zugang wird erst nach Prüfung durch den Admin freigeschaltet.
            </p>

            <form onSubmit={handleRequestAccess} className="space-y-3">
              <ErrorBox message={requestError} />
              {requestSuccess ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {requestSuccess}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Vorname</Label>
                  <Input
                    value={requestFirstName}
                    onChange={(e) => setRequestFirstName(e.target.value)}
                    className="h-11 rounded-xl border-zinc-300 bg-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nachname</Label>
                  <Input
                    value={requestLastName}
                    onChange={(e) => setRequestLastName(e.target.value)}
                    className="h-11 rounded-xl border-zinc-300 bg-white"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>E-Mail</Label>
                <Input
                  type="email"
                  value={requestEmail}
                  onChange={(e) => setRequestEmail(e.target.value)}
                  className="h-11 rounded-xl border-zinc-300 bg-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input
                  type="tel"
                  value={requestPhone}
                  onChange={(e) => setRequestPhone(e.target.value)}
                  className="h-11 rounded-xl border-zinc-300 bg-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Geschlecht</Label>
                <select
                  name="trainerRequestGender"
                  value={requestGender}
                  onChange={(event) => setRequestGender(event.target.value)}
                  className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
                  required
                >
                  <option value="" disabled>Bitte Geschlecht auswählen</option>
                  <option value="male">Männlich</option>
                  <option value="female">Weiblich</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Geburtsdatum</Label>
                <Input
                  type="date"
                  value={requestBirthdate}
                  onChange={(e) => setRequestBirthdate(e.target.value)}
                  className="h-11 rounded-xl border-zinc-300 bg-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>DOSB-Lizenz</Label>
                <select
                  name="trainerRequestDosbLicense"
                  value={requestDosbLicense}
                  onChange={(event) => setRequestDosbLicense(event.target.value)}
                  className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
                >
                  <option value="Übungsleiter C">Übungsleiter C</option>
                  <option value="Trainerassistent">Trainerassistent</option>
                  <option value="Trainer C">Trainer C</option>
                  <option value="Trainer B">Trainer B</option>
                  <option value="Trainer A">Trainer A</option>
                  <option value="Keine / noch nicht vorhanden">Keine / noch nicht vorhanden</option>
                </select>
              </div>

              <Button
                type="submit"
                disabled={requestLoading}
                className="h-11 w-full rounded-xl bg-zinc-900 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {requestLoading ? "Sende Anfrage..." : "Anfrage senden"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </FormContainer>
  )
}
