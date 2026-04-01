"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, MailCheck, ShieldCheck, UserRoundPlus, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { groupOptions } from "@/lib/boxgymSessions"
import { isValidPin, PIN_HINT, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
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

export default function MitgliedRegistrierenPage() {
  const router = useRouter()
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
  const [registerBaseGroup, setRegisterBaseGroup] = useState(groupOptions[0] ?? "")

  useEffect(() => {
    setIsClient(true)
    setRegisterFirstName(getStoredString("tsv_register_first_name"))
    setRegisterLastName(getStoredString("tsv_register_last_name"))
    setRegisterBirthDate(getStoredString("tsv_register_birthdate"))
    setRegisterGender(getStoredString("tsv_register_gender"))
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

    if (!firstName || !lastName) {
      alert("Bitte Vorname und Nachname eingeben.")
      return
    }

    if (!registerBirthDate) {
      alert("Bitte Geburtsdatum angeben.")
      return
    }

    if (!registerGender) {
      alert("Bitte männlich oder weiblich auswählen.")
      return
    }

    if (!isValidPin(pin)) {
      alert(PIN_REQUIREMENTS_MESSAGE)
      return
    }

    if (!registerEmail.trim()) {
      alert("Bitte E-Mail angeben.")
      return
    }

    if (!registerPhone.trim()) {
      alert("Bitte Telefonnummer eingeben.")
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
          gender: registerGender,
          pin,
          email: registerEmail.trim(),
          phone: registerPhone.trim(),
          baseGroup: registerBaseGroup,
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        console.error("Mitgliedsantrag fehlgeschlagen", message)
        alert(message || "Fehler beim Anlegen des Mitglieds.")
        return
      }

      const result = (await response.json()) as { verificationSent?: boolean }

      if (result.verificationSent === false) {
        alert("Reservierung fuer den Boxbereich gespeichert.\n\nDie Bestätigungs-E-Mail konnte aber nicht versendet werden.")
        return
      }

      alert("Reservierung fuer den Boxbereich gespeichert.\n\nBitte zuerst die E-Mail bestätigen. Danach sind bis zu 6 Trainings ohne Admin-Freigabe möglich.")
      router.push("/")
    } catch (error) {
      console.error(error)
      alert("Fehler beim Anlegen des Mitglieds.")
    } finally {
      setDbLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-5 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-[#154c83] px-4 py-2 text-sm font-semibold text-white">TSV-Mitglied registrieren</div>
          </div>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Zurück zur Startseite
            </Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-[24px] shadow-xl md:rounded-[28px]">
          <div className="relative bg-[#0f2740] px-4 py-6 text-white sm:px-6 sm:py-8 md:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(230,51,42,0.25),transparent_35%)]" />
            <div className="relative">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs sm:text-sm">
                  <UserRoundPlus className="h-4 w-4" />
                  TSV Falkensee · Boxbereich
                </div>
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <Image
                    src="/BoxGym Kompakt.png"
                    alt="TSV Falkensee BoxGym"
                    width={192}
                    height={128}
                    className="h-6 w-auto rounded-md bg-white/90 p-1 sm:h-14"
                  />
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">TSV-Mitglied registrieren</h1>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Card id="registrierung" className="scroll-mt-6 overflow-hidden rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Beitritt zum Boxbereich</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Nur für TSV-Mitglieder.</span>
                <InfoHint text="Der Boxbereich ist ein Angebot innerhalb des TSV. Diese Seite ist für Personen gedacht, die bereits TSV-Mitglied sind oder parallel TSV-Mitglied werden." />
              </div>
            </div>
            <div className="mb-4 rounded-2xl border border-[#cfd9e4] bg-[#f7fbff] p-4 text-sm text-zinc-800">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#154c83]">Probetraining vorher abschließen.</span>
                <InfoHint text="Wenn 3 Probetrainings verbraucht sind, erfolgt eine Mitteilung per Mail. Den TSV-Mitgliedsantrag gibt es über www.tsv-falkensee.de. Wenn die Registrierung erledigt ist, teile es mir bitte mit." />
              </div>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleMemberRegistration()
              }}
            >
              <div className="text-sm text-zinc-500">Daten erfassen und Gruppe zuordnen.</div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Vorname <span className="ml-1 text-red-500">*</span></Label>
                  <Input value={registerFirstName} onChange={(e) => setRegisterFirstName(e.target.value)} placeholder="Vorname" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </div>
                <div className="space-y-2">
                  <Label>Nachname <span className="ml-1 text-red-500">*</span></Label>
                  <Input value={registerLastName} onChange={(e) => setRegisterLastName(e.target.value)} placeholder="Nachname" className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Geburtsdatum <span className="ml-1 text-red-500">*</span></Label>
                <Input type="date" value={registerBirthDate} onChange={(e) => setRegisterBirthDate(e.target.value)} className="rounded-2xl border-zinc-300 bg-white text-zinc-900" />
              </div>

              <div className="space-y-2">
                <Label>Geschlecht <span className="ml-1 text-red-500">*</span></Label>
                <Select value={registerGender} onValueChange={setRegisterGender}>
                  <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
                    <SelectValue placeholder="Bitte auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="männlich">männlich</SelectItem>
                    <SelectItem value="weiblich">weiblich</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Stammgruppe <span className="ml-1 text-red-500">*</span></Label>
                <Select
                  value={registerBaseGroup}
                  onValueChange={(value) => setRegisterBaseGroup(normalizeTrainingGroupOrFallback(value, groupOptions[0]))}
                >
                  <SelectTrigger className="rounded-2xl border-zinc-300 bg-white text-zinc-900">
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
                <Label>Zugangspin selbst wählen <span className="ml-1 text-red-500">*</span></Label>
                <PasswordInput
                  value={registerPin}
                  onChange={(e) => setRegisterPin(e.target.value)}
                  placeholder="Eigenen Zugangspin wählen"
                  className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                />
                <p className="text-xs text-zinc-500">
                  Diesen Zugangspin legst du bei der Registrierung selbst fest.
                </p>
              </div>

              <div className="space-y-2">
                <Label>E-Mail *</Label>
                <Input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="E-Mail"
                  className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                />
              </div>

              <div className="space-y-2">
                <Label>Telefon *</Label>
                <Input
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  placeholder="z. B. +49 123 456789"
                  className="rounded-2xl border-zinc-300 bg-white text-zinc-900"
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-2xl bg-[linear-gradient(135deg,#154c83_0%,#1b5d9f_65%,#e6332a_170%)] text-white hover:opacity-95"
                disabled={dbLoading}
              >
                {dbLoading ? "Speichert..." : "Boxbereich beitreten"}
              </Button>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                {`Nach der Registrierung muss zuerst die E-Mail bestätigt werden. Geschlecht, Telefonnummer und E-Mail sind Pflichtdaten. Der Zugangspin wird bei der Registrierung selbst gewählt. ${PIN_HINT}`}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { Icon: ShieldCheck, step: "1", title: "Beitritt", text: "Daten für den Boxbereich eingeben" },
            { Icon: MailCheck, step: "2", title: "E-Mail", text: "Bestätigungslink öffnen" },
            { Icon: UsersRound, step: "3", title: "Trainingsstart", text: "Bis zu 6 Trainings möglich" },
            { Icon: UserRoundPlus, step: "4", title: "Freigabe", text: "Admin gibt final frei" },
          ].map(({ Icon, step, title, text }) => (
            <Card
              key={step}
              className="rounded-[24px] border border-[#d8e3ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] shadow-sm"
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-[#154c83] p-2.5 text-white shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Schritt {step}</div>
                    <div className="mt-1 font-semibold text-zinc-900">{title}</div>
                    <div className="mt-1 text-sm text-zinc-600">{text}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
