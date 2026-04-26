"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, UserRoundPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorBox } from "@/components/ErrorBox"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { groupOptions } from "@/lib/boxgymSessions"
import { isValidMemberPassword, MEMBER_PASSWORD_HINT, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/memberPassword"
import { normalizeTrainingGroupOrFallback } from "@/lib/trainingGroups"

function getStoredString(key: string) {
  if (typeof window === "undefined") return ""
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : ""
  } catch {
    return ""
  }
}

export default function CheckinJoinPage() {
  const router = useRouter()
  const [isClient, setIsClient] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)
  const [registerFirstName, setRegisterFirstName] = useState("")
  const [registerLastName, setRegisterLastName] = useState("")
  const [registerBirthDate, setRegisterBirthDate] = useState("")
  const [registerPin, setRegisterPin] = useState("")
  const [registerEmail, setRegisterEmail] = useState("")
  const [registerPhone, setRegisterPhone] = useState("")
  const [registerGuardianName, setRegisterGuardianName] = useState("")
  const [registerBaseGroup, setRegisterBaseGroup] = useState(groupOptions[0] ?? "")
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [privacyError, setPrivacyError] = useState("")
  const [apiError, setApiError] = useState("")

  useEffect(() => {
    setIsClient(true)
    setRegisterFirstName(getStoredString("tsv_register_first_name"))
    setRegisterLastName(getStoredString("tsv_register_last_name"))
    setRegisterBirthDate(getStoredString("tsv_register_birthdate"))
    setRegisterEmail(getStoredString("tsv_register_email"))
    setRegisterPhone(getStoredString("tsv_register_phone"))
    setRegisterGuardianName(getStoredString("tsv_register_guardian_name"))
    setRegisterBaseGroup(normalizeTrainingGroupOrFallback(getStoredString("tsv_register_base_group"), groupOptions[0]))
  }, [])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_first_name", JSON.stringify(registerFirstName))
  }, [isClient, registerFirstName])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_last_name", JSON.stringify(registerLastName))
  }, [isClient, registerLastName])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_birthdate", JSON.stringify(registerBirthDate))
  }, [isClient, registerBirthDate])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_email", JSON.stringify(registerEmail))
  }, [isClient, registerEmail])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_phone", JSON.stringify(registerPhone))
  }, [isClient, registerPhone])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_guardian_name", JSON.stringify(registerGuardianName))
  }, [isClient, registerGuardianName])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_base_group", JSON.stringify(registerBaseGroup))
  }, [isClient, registerBaseGroup])

  async function handleMemberRegistration() {
    const firstName = registerFirstName.trim()
    const lastName = registerLastName.trim()
    const pin = registerPin.trim()

    setPrivacyError("")
    setApiError("")

    if (!firstName || !lastName) {
      setApiError("Bitte Vorname und Nachname eingeben.")
      return
    }

    if (!registerBirthDate) {
      setApiError("Bitte Geburtsdatum angeben.")
      return
    }

    if (!isValidMemberPassword(pin)) {
      setApiError(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE)
      return
    }

    if (!registerEmail.trim()) {
      setApiError("Bitte E-Mail angeben.")
      return
    }

    if (!registerPhone.trim()) {
      setApiError("Bitte Telefonnummer eingeben.")
      return
    }

    if (!registerBaseGroup) {
      setApiError("Bitte Stammgruppe auswählen.")
      return
    }

    if (!privacyAccepted) {
      setPrivacyError("Bitte Datenschutz akzeptieren")
      return
    }

    try {
      setDbLoading(true)
      const body = {
        firstName,
        lastName,
        birthDate: registerBirthDate,
        password: pin,
        email: registerEmail.trim(),
        phone: registerPhone.trim(),
        baseGroup: registerBaseGroup,
        consent: true,
      }

      const response = await fetch("/api/public/member-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = (await response.json()) as { ok?: boolean; mailSent?: boolean; error?: string }

      if (!response.ok || !result.ok) {
        setApiError(result.error || "Fehler beim Anlegen des Mitglieds.")
        return
      }

      if (result.mailSent === false) {
        setApiError("Registrierung gespeichert, aber die E-Mail konnte nicht versendet werden.")
        return
      }

      alert("Registrierung gespeichert. Bitte jetzt zuerst die E-Mail bestätigen.")
      router.push("/checkin")
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(error)
      }
      setApiError("Fehler beim Anlegen des Mitglieds.")
    } finally {
      setDbLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-4 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="rounded-2xl bg-[#154c83] px-3 py-2 text-sm font-semibold text-white">Boxbereich beitreten</div>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/checkin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zur Auswahl
            </Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-[24px] shadow-xl md:rounded-[28px]">
          <div className="relative bg-[#0f2740] px-4 py-5 text-white sm:px-6 sm:py-8 md:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(230,51,42,0.25),transparent_35%)]" />
            <div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Image
                  src="/boxgym-headline-old.png"
                  alt="TSV Falkensee BoxGym"
                  width={192}
                  height={128}
                  className="h-10 w-auto rounded-md bg-white/90 p-1 sm:h-32"
                />
                <div className="min-w-0">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs sm:text-sm">
                    <UserRoundPlus className="h-4 w-4" />
                    Mobile Registrierung
                  </div>
                  <h1 className="text-xl font-bold tracking-tight sm:text-3xl">Boxbereich beitreten</h1>
                  <div className="mt-2 flex items-center gap-2 text-sm leading-6 text-blue-50/90 sm:text-base">
                    <span>Direkter Einstieg per QR-Code.</span>
                    <InfoHint text="Kompakte Handyseite für den direkten Einstieg per QR-Code." />
                  </div>
                </div>
              </div>
              <Card className="rounded-[24px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                <CardContent className="p-5">
                  <div className="rounded-2xl bg-white/10 p-3 text-sm">
                    <div className="text-zinc-300">Ablauf</div>
                    <div className="mt-1 font-semibold">Daten eingeben</div>
                    <div className="mt-1 flex items-center gap-2 text-zinc-300">
                      <span>E-Mail bestätigen.</span>
                      <InfoHint text="E-Mail bestätigen und auf Freigabe warten." />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Card className="rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Registrierung</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleMemberRegistration()
              }}
            >
              <ErrorBox message={apiError} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Vorname <span className="ml-1 text-red-500">*</span></Label>
                  <Input value={registerFirstName} onChange={(e) => setRegisterFirstName(e.target.value)} placeholder="Vorname" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </div>
                <div className="space-y-2">
                  <Label>Nachname <span className="ml-1 text-red-500">*</span></Label>
                  <Input value={registerLastName} onChange={(e) => setRegisterLastName(e.target.value)} placeholder="Nachname" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Geburtsdatum <span className="ml-1 text-red-500">*</span></Label>
                <Input type="date" value={registerBirthDate} onChange={(e) => setRegisterBirthDate(e.target.value)} className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
              </div>

              <div className="space-y-2">
                <Label>Stammgruppe <span className="ml-1 text-red-500">*</span></Label>
                <Select
                  value={registerBaseGroup}
                  onValueChange={(value) => setRegisterBaseGroup(normalizeTrainingGroupOrFallback(value, groupOptions[0]))}
                >
                  <SelectTrigger className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900">
                    <SelectValue placeholder="Gruppe auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupOptions.map((group) => (
                      <SelectItem key={group} value={group}>
                        {group}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Passwort selbst wählen <span className="ml-1 text-red-500">*</span></Label>
                <PasswordInput
                  value={registerPin}
                  onChange={(e) => setRegisterPin(e.target.value)}
                  placeholder="Eigenes Passwort wählen"
                  className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                />
                <p className="text-xs text-zinc-500">Dieses Passwort legst du bei der Registrierung selbst fest.</p>
              </div>

              <div className="space-y-2">
                <Label>E-Mail *</Label>
                <Input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="E-Mail"
                  className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(event) => {
                      setPrivacyAccepted(event.target.checked)
                      if (event.target.checked) {
                        setPrivacyError("")
                      }
                    }}
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-[#154c83]"
                  />
                  <span>
                    Ich akzeptiere die{" "}
                    <Link href="/datenschutz" className="font-medium text-[#154c83] underline underline-offset-4">
                      Datenschutzerklärung
                    </Link>
                    <span className="ml-1 text-red-500">*</span>
                  </span>
                </label>
                {privacyError ? <p className="text-sm text-red-600">{privacyError}</p> : null}
              </div>

              <div className="space-y-2">
                <Label>Telefon *</Label>
                <Input
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  placeholder="z. B. +49 123 456789"
                  className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                />
              </div>

              <Button
                type="submit"
                className="h-12 w-full rounded-2xl bg-[linear-gradient(135deg,#154c83_0%,#1b5d9f_65%,#e6332a_170%)] text-white hover:opacity-95"
                disabled={dbLoading}
              >
                {dbLoading ? "Speichert..." : "Boxbereich beitreten"}
              </Button>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <div className="flex items-center gap-2">
                  <span>{MEMBER_PASSWORD_HINT}</span>
                  <InfoHint
                    text={`Das Passwort wird bei der Registrierung selbst gewählt. ${MEMBER_PASSWORD_HINT}`}
                  />
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
