"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ChevronLeft, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TrainerLogoutButton } from "@/components/trainer-logout-button"
import { validateEmail, validateName, validatePhone } from "@/lib/formValidation"
import { clearTrainerAccess, persistTrainerAccess, readTrainerAccess } from "@/lib/trainerAccess"
import { isTrainerPinCompliant, TRAINER_PIN_HINT, TRAINER_PIN_REQUIREMENTS_MESSAGE } from "@/lib/trainerPin"

const TRAINER_VERIFY_PARAM = "trainer_verify"
const TRAINER_LOGIN_EMAIL_PARAM = "email"

type TrainerAuthSuccessPayload = {
  ok: boolean
  role: "" | "trainer" | "admin"
  accountRole: "" | "trainer" | "admin"
  linkedMemberId: string | null
  accountEmail: string
  accountFirstName: string
  accountLastName: string
  sessionUntil: number
  mustChangePassword?: boolean
}

function mapTrainerAuthErrorMessage(message: string) {
  const trimmed = message.trim()
  if (!trimmed) return "Fehler beim Trainer-Login."

  if (trimmed.startsWith("<!DOCTYPE html>") || trimmed.startsWith("<html")) {
    if (trimmed.includes("NEXT_PUBLIC_SUPABASE_URL") || trimmed.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY") || trimmed.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) {
      return "Lokal fehlen Supabase-Zugangsdaten in .env.local. Bitte NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY setzen und den Dev-Server neu starten."
    }

    return "Der lokale Server hat eine HTML-Fehlerseite statt einer API-Antwort geliefert. Bitte Dev-Server-Log prüfen."
  }

  return trimmed
}

export default function TrainerZugangPage() {
  const [trainerAuthView, setTrainerAuthView] = useState<"login" | "register">("login")
  const [trainerLoginEmail, setTrainerLoginEmail] = useState("")
  const [trainerPinInput, setTrainerPinInput] = useState("")
  const [trainerRegisterFirstName, setTrainerRegisterFirstName] = useState("")
  const [trainerRegisterLastName, setTrainerRegisterLastName] = useState("")
  const [trainerRegisterEmail, setTrainerRegisterEmail] = useState("")
  const [trainerRegisterPhone, setTrainerRegisterPhone] = useState("")
  const [trainerRegisterPin, setTrainerRegisterPin] = useState("")
  const [trainerRegisterPinConfirm, setTrainerRegisterPinConfirm] = useState("")
  const [activeRole, setActiveRole] = useState<"" | "trainer" | "admin">("")
  const [sessionChecking, setSessionChecking] = useState(true)
  const [authFeedback, setAuthFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(null)
  const [trainerRegisterErrors, setTrainerRegisterErrors] = useState<Record<string, string>>({})

  function showAuthError(message: string) {
    setAuthFeedback({ tone: "error", message })
  }

  function showAuthSuccess(message: string) {
    setAuthFeedback({ tone: "success", message })
  }

  useEffect(() => {
    const trainerAccess = readTrainerAccess()
    setActiveRole(trainerAccess.role)

    try {
      const params = new URLSearchParams(window.location.search)
      const requestedView = params.get("tab")
      const verifyToken = params.get(TRAINER_VERIFY_PARAM)

      if (requestedView === "register") {
        setTrainerAuthView("register")
      }

      const requestedEmail = params.get(TRAINER_LOGIN_EMAIL_PARAM)?.trim().toLowerCase()
      if (requestedEmail) {
        setTrainerAuthView("login")
        setTrainerLoginEmail(requestedEmail)
      }

      if (verifyToken) {
        void (async () => {
          try {
            const response = await fetch("/api/public/trainer-access", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "verify_email",
                token: verifyToken,
              }),
            })

            if (!response.ok) {
              const message = await response.text()
              showAuthError(message || "Fehler bei der Trainer-E-Mail-Bestätigung.")
              return
            }

            const result = (await response.json()) as { email?: string }
            showAuthSuccess("Trainer-E-Mail erfolgreich bestätigt. Der Admin kann den Zugang jetzt freigeben.")
            setTrainerRegisterErrors({})
            setTrainerAuthView("login")
            setTrainerLoginEmail(result.email ?? "")

            params.delete(TRAINER_VERIFY_PARAM)
            const nextQuery = params.toString()
            const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`
            window.history.replaceState({}, "", nextUrl)
          } catch (error) {
            console.error(error)
            showAuthError("Fehler bei der Trainer-E-Mail-Bestätigung.")
          }
        })()
      }
    } catch (error) {
      console.error("Trainer verify handling failed", error)
    }

    void (async () => {
      try {
        const response = await fetch("/api/trainer-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })

        if (!response.ok) {
          clearTrainerAccess()
          setActiveRole("")
          return
        }

        const payload = (await response.json()) as TrainerAuthSuccessPayload
        persistTrainerAccess(
          payload.role,
          payload.sessionUntil,
          payload.accountRole,
          payload.linkedMemberId,
          {
            email: payload.accountEmail,
            firstName: payload.accountFirstName,
            lastName: payload.accountLastName,
          }
        )
        setActiveRole(payload.role)
      } catch (error) {
        console.error("Trainer session sync failed", error)
      } finally {
        setSessionChecking(false)
      }
    })()
  }, [])

  function persistTrainerLogin(payload: TrainerAuthSuccessPayload) {
    persistTrainerAccess(
      payload.role,
      payload.sessionUntil,
      payload.accountRole,
      payload.linkedMemberId,
      {
        email: payload.accountEmail,
        firstName: payload.accountFirstName,
        lastName: payload.accountLastName,
      }
    )
    setActiveRole(payload.role)
    if (payload.mustChangePassword) {
      window.location.assign("/trainer/passwort-aendern")
    } else {
      window.location.assign(payload.role === "admin" ? "/verwaltung" : "/trainer")
    }
  }

  async function loginTrainerWithCredentials(email: string, pin: string) {
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedPin = pin.trim()

    const response = await fetch("/api/trainer-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        pin: normalizedPin,
      }),
    })

    if (!response.ok) {
      if (response.status === 401) {
        showAuthError("Zugangsdaten nicht korrekt oder noch nicht freigegeben.")
        return
      }
      if (response.status === 429) {
        const message = await response.text()
        showAuthError(message || "Zu viele Fehlversuche. Bitte später erneut versuchen.")
        return
      }
      throw new Error(mapTrainerAuthErrorMessage(await response.text()))
    }

    const payload = (await response.json()) as TrainerAuthSuccessPayload
    persistTrainerLogin(payload)
  }

  async function handleTrainerLogin() {
    if (!trainerLoginEmail.trim() || !trainerPinInput.trim()) {
      showAuthError("Bitte E-Mail und Passwort eingeben.")
      return
    }

    try {
      setAuthFeedback(null)
      await loginTrainerWithCredentials(trainerLoginEmail, trainerPinInput)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Fehler beim Trainer-Login."
      showAuthError(message)
    }
  }

  async function handleTrainerRegistration() {
    const firstName = trainerRegisterFirstName.trim()
    const lastName = trainerRegisterLastName.trim()
    const email = trainerRegisterEmail.trim().toLowerCase()
    const phone = trainerRegisterPhone.trim()
    const pin = trainerRegisterPin.trim()
    const fieldErrors: Record<string, string> = {}

    const firstNameValidation = validateName(firstName, "Vorname")
    if (!firstNameValidation.valid) {
      fieldErrors.firstName = firstNameValidation.error || ""
    }

    const lastNameValidation = validateName(lastName, "Nachname")
    if (!lastNameValidation.valid) {
      fieldErrors.lastName = lastNameValidation.error || ""
    }

    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      fieldErrors.email = emailValidation.error || ""
    }

    const phoneValidation = validatePhone(phone, true)
    if (!phoneValidation.valid) {
      fieldErrors.phone = phoneValidation.error || ""
    }

    if (!isTrainerPinCompliant(pin)) {
      fieldErrors.pin = TRAINER_PIN_REQUIREMENTS_MESSAGE
    }

    if (pin !== trainerRegisterPinConfirm.trim()) {
      fieldErrors.pinConfirm = "Die Passwörter stimmen nicht überein."
    }

    if (Object.keys(fieldErrors).length > 0) {
      setTrainerRegisterErrors(fieldErrors)
      showAuthError("Bitte alle Pflichtfelder korrekt ausfüllen.")
      return
    }

    try {
      setTrainerRegisterErrors({})
      setAuthFeedback(null)
      const response = await fetch("/api/public/trainer-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          firstName,
          lastName,
          email,
          phone: phone || undefined,
          pin,
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || "Trainerregistrierung fehlgeschlagen.")
      }

      showAuthSuccess("Trainerregistrierung erfasst. Bitte E-Mail bestätigen und danach auf die Admin-Freigabe warten.")
      setTrainerRegisterErrors({})
      setTrainerAuthView("login")
      setTrainerLoginEmail(email)
      setTrainerPinInput("")
      setTrainerRegisterFirstName("")
      setTrainerRegisterLastName("")
      setTrainerRegisterEmail("")
      setTrainerRegisterPhone("")
      setTrainerRegisterPin("")
      setTrainerRegisterPinConfirm("")
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Trainerregistrierung fehlgeschlagen."
      showAuthError(message)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-5 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="rounded-2xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white">Trainerzugang</div>
          <div className="flex flex-wrap items-center gap-3">
            {activeRole ? (
              <TrainerLogoutButton
                className="rounded-2xl border-zinc-300"
                onLoggedOut={() => {
                  setAuthFeedback(null)
                  setActiveRole("")
                  setTrainerPinInput("")
                }}
              />
            ) : null}
            <Button asChild variant="outline" className="rounded-2xl">
              <Link href="/">
                <ChevronLeft className="mr-2 h-4 w-4" />
                Zurück zur Startseite
              </Link>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] shadow-xl md:rounded-[28px]">
          <div className="relative bg-[#0f2740] px-4 py-4 text-white sm:px-6 sm:py-8 md:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(230,51,42,0.25),transparent_35%)]" />
            <div className="relative flex items-center gap-3">
              <Image
                src="/boxgym-headline-old.png"
                alt="TSV Falkensee BoxGym"
                width={192}
                height={128}
                className="h-6 w-auto rounded-md bg-white/90 p-1 sm:h-20"
                priority
              />
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] sm:px-3 sm:text-sm">
                  <Lock className="h-4 w-4" />
                  Geschützter Bereich
                </div>
                <h1 className="text-base font-bold tracking-tight sm:text-3xl">Trainerzugang</h1>
                <p className="mt-1 text-[11px] leading-4 text-blue-50/85 sm:mt-2 sm:text-base sm:leading-6">Login und Registrierung.</p>
              </div>
            </div>
          </div>
        </div>

        {activeRole ? (
          <Card className="rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-zinc-700">
                Aktiver Zugang: <span className="font-semibold">{activeRole === "admin" ? "Admin" : "Trainer"}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
                  <Link href={activeRole === "admin" ? "/verwaltung" : "/trainer"}>
                    {activeRole === "admin" ? "Zur Verwaltung" : "Zum Trainerbereich"}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!activeRole && sessionChecking ? (
          <Card className="rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm">
            <CardContent className="p-5 text-sm text-zinc-500">Trainer-Session wird geprüft...</CardContent>
          </Card>
        ) : null}

        {!activeRole && !sessionChecking ? (
          <Card className="rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm">
            <CardContent className="p-5">
              {authFeedback ? (
                <>
                  <div
                    className={
                      authFeedback.tone === "error"
                        ? "mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                        : "mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                    }
                  >
                    {authFeedback.message}
                  </div>
                  {/* Passwort zurücksetzen Button bei Login-Fehler und vorhandener E-Mail */}
                  {authFeedback.tone === "error" && trainerLoginEmail.trim().length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mb-4 rounded-2xl border-[#c8d8ea] text-[#154c83]"
                      onClick={() => {
                        window.location.href = `/trainer/passwort-zuruecksetzen?email=${encodeURIComponent(trainerLoginEmail.trim())}`
                      }}
                    >
                      Passwort zurücksetzen
                    </Button>
                  )}
                </>
              ) : null}

              <Tabs
                value={trainerAuthView}
                onValueChange={(value) => {
                  setAuthFeedback(null)
                  setTrainerRegisterErrors({})
                  setTrainerAuthView(value as "login" | "register")
                }}
              >
                <TabsList className="mb-4 rounded-2xl">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="register">Registrieren</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void handleTrainerLogin()
                    }}
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Trainer-E-Mail</Label>
                        <Input
                          type="email"
                          value={trainerLoginEmail}
                          onChange={(e) => setTrainerLoginEmail(e.target.value)}
                          placeholder="name@tsv-falkensee.de"
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Passwort</Label>
                        <PasswordInput
                          value={trainerPinInput}
                          onChange={(e) => setTrainerPinInput(e.target.value)}
                          placeholder="Passwort eingeben"
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                        />
                        <div className="text-xs text-zinc-500">Bestehende Zugänge bleiben gültig. Für neue oder geänderte Passwörter gelten mindestens 8 Zeichen.</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button type="submit" className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
                        Entsperren
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => {
                          setAuthFeedback(null)
                          setTrainerRegisterErrors({})
                          setTrainerAuthView("register")
                        }}
                      >
                        Noch keine Zugangsdaten?
                      </Button>
                    </div>
                  </form>

                </TabsContent>

                <TabsContent value="register">
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void handleTrainerRegistration()
                    }}
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Vorname <span className="ml-1 text-red-500">*</span></Label>
                        <Input value={trainerRegisterFirstName} onChange={(e) => setTrainerRegisterFirstName(e.target.value)} placeholder="Vorname" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                        {trainerRegisterErrors.firstName ? <p className="mt-1 text-sm text-red-500">{trainerRegisterErrors.firstName}</p> : null}
                      </div>
                      <div className="space-y-2">
                        <Label>Nachname <span className="ml-1 text-red-500">*</span></Label>
                        <Input value={trainerRegisterLastName} onChange={(e) => setTrainerRegisterLastName(e.target.value)} placeholder="Nachname" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                        {trainerRegisterErrors.lastName ? <p className="mt-1 text-sm text-red-500">{trainerRegisterErrors.lastName}</p> : null}
                      </div>
                      <div className="space-y-2">
                        <Label>E-Mail <span className="ml-1 text-red-500">*</span></Label>
                        <Input type="email" value={trainerRegisterEmail} onChange={(e) => setTrainerRegisterEmail(e.target.value)} placeholder="name@tsv-falkensee.de" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                        {trainerRegisterErrors.email ? <p className="mt-1 text-sm text-red-500">{trainerRegisterErrors.email}</p> : null}
                      </div>
                      <div className="space-y-2">
                        <Label>Telefon <span className="ml-1 text-red-500">*</span></Label>
                        <Input type="tel" value={trainerRegisterPhone} onChange={(e) => setTrainerRegisterPhone(e.target.value)} placeholder="Telefonnummer eingeben" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                        {trainerRegisterErrors.phone ? <p className="mt-1 text-sm text-red-500">{trainerRegisterErrors.phone}</p> : null}
                      </div>
                      <div className="space-y-2">
                        <Label>Passwort <span className="ml-1 text-red-500">*</span></Label>
                        <PasswordInput
                          value={trainerRegisterPin}
                          onChange={(e) => setTrainerRegisterPin(e.target.value)}
                          placeholder="8 bis 64 Zeichen"
                          className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                        />
                        {trainerRegisterErrors.pin ? <p className="mt-1 text-sm text-red-500">{trainerRegisterErrors.pin}</p> : null}
                        <div className="text-xs text-zinc-500">{TRAINER_PIN_HINT}</div>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Passwort wiederholen <span className="ml-1 text-red-500">*</span></Label>
                        <PasswordInput value={trainerRegisterPinConfirm} onChange={(e) => setTrainerRegisterPinConfirm(e.target.value)} placeholder="Passwort wiederholen" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                        {trainerRegisterErrors.pinConfirm ? <p className="mt-1 text-sm text-red-500">{trainerRegisterErrors.pinConfirm}</p> : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                      <div className="flex items-center gap-2">
                        <span>Erst E-Mail bestätigen, dann Freigabe.</span>
                        <InfoHint text="Nach der Registrierung wird zuerst die E-Mail bestätigt. Anschließend gibt der Admin den Trainerzugang frei." />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button type="submit" className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
                        Trainer registrieren
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => {
                          setAuthFeedback(null)
                          setTrainerRegisterErrors({})
                          setTrainerAuthView("login")
                        }}
                      >
                        Zurück zum Login
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
