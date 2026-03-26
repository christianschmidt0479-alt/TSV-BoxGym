"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, UserRoundPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { hashSecret } from "@/lib/clientCrypto"
import { groupOptions } from "@/lib/boxgymSessions"
import { isValidPin, PIN_HINT, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { QR_ACCESS_MINUTES, QR_ACCESS_STORAGE_KEY } from "@/lib/qrAccess"

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
  const [registerParentAccessCode, setRegisterParentAccessCode] = useState("")
  const [registerBaseGroup, setRegisterBaseGroup] = useState(groupOptions[0] ?? "")

  useEffect(() => {
    setIsClient(true)
    window.localStorage.setItem(QR_ACCESS_STORAGE_KEY, String(Date.now() + QR_ACCESS_MINUTES * 60 * 1000))
    setRegisterFirstName(getStoredString("tsv_register_first_name"))
    setRegisterLastName(getStoredString("tsv_register_last_name"))
    setRegisterBirthDate(getStoredString("tsv_register_birthdate"))
    setRegisterPin(getStoredString("tsv_register_pin"))
    setRegisterEmail(getStoredString("tsv_register_email"))
    setRegisterPhone(getStoredString("tsv_register_phone"))
    setRegisterGuardianName(getStoredString("tsv_register_guardian_name"))
    setRegisterParentAccessCode(getStoredString("tsv_register_parent_access_code"))
    setRegisterBaseGroup(getStoredString("tsv_register_base_group") || (groupOptions[0] ?? ""))
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
    localStorage.setItem("tsv_register_pin", JSON.stringify(registerPin))
  }, [isClient, registerPin])

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
    localStorage.setItem("tsv_register_parent_access_code", JSON.stringify(registerParentAccessCode))
  }, [isClient, registerParentAccessCode])

  useEffect(() => {
    if (!isClient) return
    localStorage.setItem("tsv_register_base_group", JSON.stringify(registerBaseGroup))
  }, [isClient, registerBaseGroup])

  async function handleMemberRegistration() {
    const firstName = registerFirstName.trim()
    const lastName = registerLastName.trim()
    const pin = registerPin.trim()
    const guardianName = registerGuardianName.trim()
    const parentAccessCode = registerParentAccessCode.trim()
    const isBoxzwergeRegistration = registerBaseGroup === "Boxzwerge"

    if (!firstName || !lastName) {
      alert("Bitte Vorname und Nachname eingeben.")
      return
    }

    if (!registerBirthDate) {
      alert("Bitte Geburtsdatum angeben.")
      return
    }

    if (!isBoxzwergeRegistration && !isValidPin(pin)) {
      alert(PIN_REQUIREMENTS_MESSAGE)
      return
    }

    if (!registerEmail.trim()) {
      alert(isBoxzwergeRegistration ? "Bitte Eltern-E-Mail angeben." : "Bitte E-Mail angeben.")
      return
    }

    if (!registerPhone.trim()) {
      alert(isBoxzwergeRegistration ? "Bitte Eltern-Telefonnummer angeben." : "Bitte Telefonnummer angeben.")
      return
    }

    if (isBoxzwergeRegistration && !guardianName) {
      alert("Bitte einen Elternteil oder Notfallkontakt angeben.")
      return
    }

    if (isBoxzwergeRegistration && !isValidPin(parentAccessCode)) {
      alert(PIN_REQUIREMENTS_MESSAGE)
      return
    }

    if (!registerBaseGroup) {
      alert("Bitte Stammgruppe auswählen.")
      return
    }

    try {
      setDbLoading(true)
      const response = await fetch("/api/public/member-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          birthDate: registerBirthDate,
          pin,
          email: registerEmail.trim(),
          phone: registerPhone.trim(),
          guardianName,
          parentAccessCodeHash: isBoxzwergeRegistration ? await hashSecret(parentAccessCode) : undefined,
          baseGroup: registerBaseGroup,
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        alert(message || "Fehler beim Anlegen des Mitglieds.")
        return
      }

      const result = (await response.json()) as { verificationSent?: boolean }

      if (result.verificationSent === false) {
        alert("Reservierung gespeichert. Die Bestätigungs-E-Mail konnte aber nicht versendet werden.")
        return
      }

      alert("Reservierung gespeichert. Bitte jetzt zuerst die E-Mail bestätigen.")
      router.push("/checkin")
    } catch (error) {
      console.error(error)
      alert("Fehler beim Anlegen des Mitglieds.")
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
                  src="/BoxGym Kompakt.png"
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
              {registerBaseGroup === "Boxzwerge" ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  <div className="flex items-center gap-2">
                    <span>Boxzwerge über Eltern registrieren.</span>
                    <InfoHint text="Bei Boxzwergen registrieren Eltern ihre Kinder. Ein Elternkonto kann später mehrere Kinder verwalten." />
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Vorname</Label>
                  <Input value={registerFirstName} onChange={(e) => setRegisterFirstName(e.target.value)} placeholder="Vorname" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </div>
                <div className="space-y-2">
                  <Label>Nachname</Label>
                  <Input value={registerLastName} onChange={(e) => setRegisterLastName(e.target.value)} placeholder="Nachname" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Geburtsdatum</Label>
                <Input type="date" value={registerBirthDate} onChange={(e) => setRegisterBirthDate(e.target.value)} className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
              </div>

              <div className="space-y-2">
                <Label>Stammgruppe</Label>
                <Select value={registerBaseGroup} onValueChange={setRegisterBaseGroup}>
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

              {registerBaseGroup === "Boxzwerge" ? (
                <>
                  <div className="space-y-2">
                    <Label>Eltern-Zugangscode</Label>
                    <PasswordInput
                      value={registerParentAccessCode}
                      onChange={(e) => setRegisterParentAccessCode(e.target.value)}
                      placeholder="6 bis 16 Zeichen"
                      className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Elternteil / Notfallkontakt</Label>
                    <Input
                      value={registerGuardianName}
                      onChange={(e) => setRegisterGuardianName(e.target.value)}
                      placeholder="Name eines Elternteils"
                      className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>Zugangspin selbst wählen</Label>
                  <PasswordInput
                    value={registerPin}
                    onChange={(e) => setRegisterPin(e.target.value)}
                    placeholder="Eigenen Zugangspin wählen"
                    className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                  <p className="text-xs text-zinc-500">Diesen Zugangspin legst du bei der Registrierung selbst fest.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>{registerBaseGroup === "Boxzwerge" ? "Eltern-E-Mail" : "E-Mail"}</Label>
                <Input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder={registerBaseGroup === "Boxzwerge" ? "E-Mail eines Elternteils" : "E-Mail"}
                  className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                />
              </div>

              <div className="space-y-2">
                <Label>{registerBaseGroup === "Boxzwerge" ? "Eltern-Telefon / Notfallkontakt" : "Telefonnummer"}</Label>
                <Input
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  placeholder={registerBaseGroup === "Boxzwerge" ? "Telefonnummer eines Elternteils" : "Telefonnummer"}
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
                  <span>{registerBaseGroup === "Boxzwerge" ? "Pflichtangaben für Eltern beachten." : PIN_HINT}</span>
                  <InfoHint
                    text={
                      registerBaseGroup === "Boxzwerge"
                        ? "Eltern-E-Mail, Eltern-Telefon, Eltern-Zugangscode und ein Notfallkontakt sind Pflicht."
                        : `Der Zugangspin wird bei der Registrierung selbst gewählt. ${PIN_HINT}`
                    }
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
