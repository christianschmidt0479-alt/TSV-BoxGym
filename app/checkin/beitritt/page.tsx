"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"

import { ErrorBox } from "@/components/ErrorBox"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { isValidMemberPassword, MEMBER_PASSWORD_HINT, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/memberPassword"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

function getStoredString(key: string) {
  if (typeof window === "undefined") return ""
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : ""
  } catch {
    return ""
  }
}

function getAgeFromBirthdate(dateString: string): number | null {
  if (!dateString) return null

  const today = new Date()
  const birthDate = new Date(dateString)
  if (Number.isNaN(birthDate.getTime())) return null

  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

export default function CheckinJoinPage() {
  const [isClient, setIsClient] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)
  const [registerFirstName, setRegisterFirstName] = useState("")
  const [registerLastName, setRegisterLastName] = useState("")
  const [registerBirthDate, setRegisterBirthDate] = useState("")
  const [registerGender, setRegisterGender] = useState("")
  const [registerPin, setRegisterPin] = useState("")
  const [registerEmail, setRegisterEmail] = useState("")
  const [registerPhone, setRegisterPhone] = useState("")
  const [registerGuardianName, setRegisterGuardianName] = useState("")
  const [registerBaseGroup, setRegisterBaseGroup] = useState<string>("")
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [privacyError, setPrivacyError] = useState("")
  const [apiError, setApiError] = useState("")
  const [registrationSuccessMessage, setRegistrationSuccessMessage] = useState("")

  useEffect(() => {
    setIsClient(true)
    setRegisterFirstName(getStoredString("tsv_register_first_name"))
    setRegisterLastName(getStoredString("tsv_register_last_name"))
    setRegisterBirthDate(getStoredString("tsv_register_birthdate"))
    const savedGender = getStoredString("tsv_register_gender")
    if (savedGender) setRegisterGender(savedGender)
    setRegisterEmail(getStoredString("tsv_register_email"))
    setRegisterPhone(getStoredString("tsv_register_phone"))
    setRegisterGuardianName(getStoredString("tsv_register_guardian_name"))
    setRegisterBaseGroup("")
    window.localStorage.removeItem("tsv_register_base_group")
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
    localStorage.setItem("tsv_register_gender", JSON.stringify(registerGender))
  }, [isClient, registerGender])

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

    if (!registerGender) {
      setApiError("Bitte wähle ein Geschlecht aus")
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
      setApiError("Bitte wähle eine Stammgruppe aus")
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
        gender: registerGender,
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

      setApiError("")
      setRegistrationSuccessMessage("Registrierung erfolgreich. Bitte bestätige jetzt deine E-Mail-Adresse über den Link, den wir dir gesendet haben. Danach kann dein Zugang freigegeben werden.")
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(error)
      }
      setApiError("Fehler beim Anlegen des Mitglieds.")
    } finally {
      setDbLoading(false)
    }
  }

  const age = getAgeFromBirthdate(registerBirthDate)

  const suggestedGroup = (() => {
    if (age === null) return null
    if (age <= 14) return "Basic 10 - 14 Jahre"
    if (age <= 18) return "Basic 15 - 18 Jahre"
    return "Basic Ü18"
  })()

  return (
    <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-12 text-zinc-900 md:px-6 md:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 text-center">
          <Image src="/logo.png" alt="TSV Falkensee" width={64} height={64} className="h-20 w-auto mx-auto mb-4" />
          <h1 className="text-xl font-semibold">Boxbereich beitreten</h1>
          <p className="text-sm text-gray-600 mt-2">Registrierung für den Bereich Boxen im TSV Falkensee.</p>
        </div>

        <div className="text-xs text-gray-500 text-center mb-6">Die Teilnahme am Boxtraining ist nur für Mitglieder des TSV Falkensee möglich.</div>

        <div className="text-sm text-gray-600 text-center mb-4">
          Bitte fülle die folgenden Angaben vollständig aus.
        </div>

        <div className="bg-white rounded-xl p-6 space-y-4 border border-gray-200">
          {registrationSuccessMessage ? (
            <div className="space-y-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-4">
              <p className="text-sm font-semibold text-emerald-900">{registrationSuccessMessage}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/mein-bereich/login"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-[#154c83] px-4 text-sm font-semibold text-white transition hover:bg-[#123f6e]"
                >
                  Zum Login
                </Link>
                <Link
                  href="/checkin"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
                >
                  Zurück zum Check-in
                </Link>
              </div>
            </div>
          ) : (
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
                <Label className="text-sm font-medium">Vorname <span className="ml-1 text-gray-800">*</span></Label>
                <Input value={registerFirstName} onChange={(e) => setRegisterFirstName(e.target.value)} placeholder="Vorname" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nachname <span className="ml-1 text-gray-800">*</span></Label>
                <Input value={registerLastName} onChange={(e) => setRegisterLastName(e.target.value)} placeholder="Nachname" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Geburtsdatum <span className="ml-1 text-gray-800">*</span></Label>
              <Input type="date" value={registerBirthDate} onChange={(e) => setRegisterBirthDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Geschlecht <span className="ml-1 text-gray-800">*</span></label>
              <select
                name="gender"
                required
                value={registerGender}
                onChange={(event) => setRegisterGender(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>Bitte Geschlecht auswählen</option>
                <option value="male">Männlich</option>
                <option value="female">Weiblich</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Stammgruppe <span className="ml-1 text-gray-800">*</span></Label>
              <select
                name="registerGroup"
                value={registerBaseGroup}
                onChange={(e) => setRegisterBaseGroup(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Bitte Stammgruppe auswählen
                </option>
                <option value="Basic 10 - 14 Jahre">Basic 10 - 14 Jahre</option>
                <option value="Basic 15 - 18 Jahre">Basic 15 - 18 Jahre</option>
                <option value="Basic Ü18">Basic Ü18</option>
                <option value="L-Gruppe">L-Gruppe</option>
              </select>
              {suggestedGroup && !registerBaseGroup ? (
                <div className="mt-2 text-xs text-blue-700">
                  Empfohlene Gruppe basierend auf dem Alter: <strong>{suggestedGroup}</strong>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Passwort selbst wählen <span className="ml-1 text-gray-800">*</span></Label>
              <PasswordInput
                value={registerPin}
                onChange={(e) => setRegisterPin(e.target.value)}
                placeholder="Eigenes Passwort wählen"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-zinc-500">Dieses Passwort legst du bei der Registrierung selbst fest.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">E-Mail *</Label>
              <Input
                type="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="E-Mail"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
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
                  <span className="ml-1 text-gray-800">*</span>
                </span>
              </label>
              {privacyError ? <p className="text-sm text-red-600">{privacyError}</p> : null}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Telefon *</Label>
              <Input
                value={registerPhone}
                onChange={(e) => setRegisterPhone(e.target.value)}
                placeholder="z. B. +49 123 456789"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#0f2a44] hover:bg-[#13365a] text-white py-3 rounded-md"
              disabled={dbLoading}
            >
              {dbLoading ? "Speichert..." : "Registrierung abschließen"}
            </button>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <div className="flex items-center gap-2">
                <span>{MEMBER_PASSWORD_HINT}</span>
                <InfoHint
                  text={`Das Passwort wird bei der Registrierung selbst gewählt. ${MEMBER_PASSWORD_HINT}`}
                />
              </div>
            </div>
          </form>
          )}

          <div className="text-xs text-gray-500 text-center mt-6">Noch kein TSV-Mitglied?</div>
          <a
            href="https://tsv-falkensee.de/service/mitgliedschaft/"
            target="_blank"
            rel="noreferrer"
            className="block text-center text-blue-700 text-sm mt-2 underline"
          >
            Mitglied beim TSV Falkensee werden
          </a>
        </div>
      </div>
    </div>
  )
}
