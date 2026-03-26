"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { sessions } from "@/lib/boxgymSessions"
import { QR_ACCESS_MINUTES, QR_ACCESS_STORAGE_KEY } from "@/lib/qrAccess"

function todayString() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getDayKey(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`)
  const day = date.getDay()

  switch (day) {
    case 1:
      return "Montag"
    case 2:
      return "Dienstag"
    case 3:
      return "Mittwoch"
    case 4:
      return "Donnerstag"
    case 5:
      return "Freitag"
    default:
      return ""
  }
}

export default function TrialCheckinPage() {
  const [now, setNow] = useState<Date | null>(null)
  const [dbLoading, setDbLoading] = useState(false)
  const [trialFirstName, setTrialFirstName] = useState("")
  const [trialLastName, setTrialLastName] = useState("")
  const [trialBirthDate, setTrialBirthDate] = useState("")
  const [trialEmail, setTrialEmail] = useState("")
  const [trialPhone, setTrialPhone] = useState("")
  const [selectedSessionId, setSelectedSessionId] = useState<string>("")
  const [requestedGroup, setRequestedGroup] = useState("")

  const liveDate = now ? todayStringFromDate(now) : todayString()
  useEffect(() => {
    setNow(new Date())
    window.localStorage.setItem(QR_ACCESS_STORAGE_KEY, String(Date.now() + QR_ACCESS_MINUTES * 60 * 1000))
    const params = new URLSearchParams(window.location.search)
    setRequestedGroup(params.get("group")?.trim() ?? "")
  }, [])

  const todaysSessions = useMemo(() => {
    const dayKey = getDayKey(liveDate)
    return sessions.filter((session) => session.dayKey === dayKey)
  }, [liveDate])

  const displaySessions = useMemo(() => {
    if (!requestedGroup) return todaysSessions
    return todaysSessions.filter((session) => session.group === requestedGroup)
  }, [requestedGroup, todaysSessions])
  const selectedSession = displaySessions.find((session) => session.id === selectedSessionId) ?? displaySessions[0] ?? null

  useEffect(() => {
    if (displaySessions.length === 0) {
      setSelectedSessionId("")
      return
    }

    const exists = displaySessions.some((session) => session.id === selectedSessionId)
    if (!exists) {
      setSelectedSessionId(displaySessions[0].id)
    }
  }, [displaySessions, selectedSessionId])

  async function handleTrialCheckin() {
    const firstName = trialFirstName.trim()
    const lastName = trialLastName.trim()

    if (!firstName || !lastName) {
      alert("Bitte Vorname und Nachname eingeben.")
      return
    }

    if (!trialBirthDate) {
      alert("Bitte Geburtsdatum angeben.")
      return
    }

    if (!trialEmail.trim()) {
      alert("Bitte E-Mail angeben.")
      return
    }

    if (!trialPhone.trim()) {
      alert("Bitte Telefonnummer angeben.")
      return
    }

    if (!selectedSession) {
      alert("Bitte eine Trainingsgruppe auswählen.")
      return
    }

    try {
      setDbLoading(true)
      const response = await fetch("/api/public/trial-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          birthDate: trialBirthDate,
          email: trialEmail.trim(),
          phone: trialPhone.trim(),
          sessionId: selectedSession.id,
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        alert(message || "Fehler beim Speichern des Probetrainings.")
        return
      }

      alert("Probetraining erfolgreich angemeldet.")
      setTrialFirstName("")
      setTrialLastName("")
      setTrialBirthDate("")
      setTrialEmail("")
      setTrialPhone("")
    } catch (error) {
      console.error(error)
      alert("Fehler beim Speichern des Probetrainings.")
    } finally {
      setDbLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-4 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="rounded-2xl bg-[#154c83] px-3 py-2 text-sm font-semibold text-white">Probetraining</div>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/checkin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zur Auswahl
            </Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-[24px] shadow-xl md:rounded-[28px]">
          <div className="relative bg-[#0f2740] px-4 py-4 text-white sm:px-6 sm:py-8 md:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(230,51,42,0.25),transparent_35%)]" />
            <div className="relative grid gap-4 md:grid-cols-[1.45fr_1fr] md:items-center md:gap-6">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] sm:mb-3 sm:px-3 sm:text-sm">
                  <UserPlus className="h-4 w-4" />
                  Probetraining
                </div>
                <div className="flex items-center gap-3">
                  <Image
                    src="/BoxGym Kompakt.png"
                    alt="TSV Falkensee BoxGym"
                    width={192}
                    height={128}
                    className="h-6 w-auto rounded-md bg-white/90 p-1 sm:h-32"
                  />
                  <div className="min-w-0">
                    <h1 className="text-base font-bold tracking-tight sm:text-3xl">Probetraining anmelden</h1>
                    <p className="mt-1 text-[11px] leading-4 text-blue-50/85 sm:mt-2 sm:text-base sm:leading-6">
                      Neue Gäste direkt für die aktuelle Einheit anmelden.
                    </p>
                  </div>
                </div>
              </div>
              <Card className="rounded-[24px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                <CardContent className="p-3.5 sm:p-5">
                  <div className="rounded-2xl bg-white/10 p-2.5 text-xs sm:p-3 sm:text-sm">
                    <div className="text-zinc-300">Aktuelle Einheit</div>
                    <div className="mt-1 font-semibold">{selectedSession?.group ?? "Keine Gruppe"}</div>
                    <div className="mt-1 text-zinc-300">
                      {selectedSession ? `${selectedSession.start} – ${selectedSession.end}` : "Heute keine Einheit"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Card className="rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Probetraining</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-2xl border border-[#cfd9e4] bg-[#f7fbff] p-4 text-sm text-zinc-800">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#154c83]">Nach dem Probetraining im Boxbereich bleiben?</span>
                <InfoHint text="Wenn 3 Probetrainings verbraucht sind, erfolgt eine Mitteilung per Mail. Über www.tsv-falkensee.de kann dann der Mitgliedsantrag gestellt werden. Nach der Registrierung bitte kurz Bescheid geben." />
              </div>
              <div className="mt-1">Mitgliedsantrag danach über den TSV.</div>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleTrialCheckin()
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Vorname</Label>
                  <Input value={trialFirstName} onChange={(e) => setTrialFirstName(e.target.value)} placeholder="Vorname" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </div>
                <div className="space-y-2">
                  <Label>Nachname</Label>
                  <Input value={trialLastName} onChange={(e) => setTrialLastName(e.target.value)} placeholder="Nachname" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Geburtsdatum</Label>
                <Input type="date" value={trialBirthDate} onChange={(e) => setTrialBirthDate(e.target.value)} className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
              </div>

              <div className="space-y-2">
                <Label>E-Mail</Label>
                <Input type="email" value={trialEmail} onChange={(e) => setTrialEmail(e.target.value)} placeholder="E-Mail" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
              </div>

              <div className="space-y-2">
                <Label>Telefonnummer</Label>
                <Input value={trialPhone} onChange={(e) => setTrialPhone(e.target.value)} placeholder="Telefonnummer" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
              </div>

              <div className="space-y-2">
                <Label>Trainingsgruppe</Label>
                <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                  <SelectTrigger className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {displaySessions.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Keine Gruppen verfügbar
                      </SelectItem>
                    ) : (
                      displaySessions.map((session) => (
                        <SelectItem key={session.id} value={session.id}>
                          {session.title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>


              <div className="sticky bottom-3 -mx-1 rounded-[24px] border border-[#d8e3ee] bg-white/95 p-2 shadow-lg backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
                <Button type="submit" className="h-12 w-full rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" disabled={dbLoading || !selectedSession}>
                  {dbLoading ? "Speichert..." : "Probetraining anmelden"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function todayStringFromDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
