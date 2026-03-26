"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Smartphone, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoHint } from "@/components/ui/info-hint"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { clearRememberedMemberDevice, persistRememberedMemberDevice, readRememberedMemberDevice } from "@/lib/memberDeviceAccess"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { sessions } from "@/lib/boxgymSessions"
import { isValidPin, PIN_HINT, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
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

export default function MemberCheckinPage() {
  const [now, setNow] = useState<Date | null>(null)
  const [dbLoading, setDbLoading] = useState(false)
  const [fastCheckinLoading, setFastCheckinLoading] = useState(false)
  const [memberEmail, setMemberEmail] = useState("")
  const [memberFirstName, setMemberFirstName] = useState("")
  const [memberLastName, setMemberLastName] = useState("")
  const [memberPin, setMemberPin] = useState("")
  const [memberBirthDate, setMemberBirthDate] = useState("")
  const [memberWeight, setMemberWeight] = useState("")
  const [rememberDevice, setRememberDevice] = useState(true)
  const [rememberedToken, setRememberedToken] = useState("")
  const [rememberedMemberId, setRememberedMemberId] = useState("")
  const [rememberedFirstName, setRememberedFirstName] = useState("")
  const [rememberedLastName, setRememberedLastName] = useState("")
  const [rememberedCompetitionMember, setRememberedCompetitionMember] = useState(false)
  const [rememberedWeight, setRememberedWeight] = useState("")
  const [selectedSessionId, setSelectedSessionId] = useState<string>("")
  const [requestedGroup, setRequestedGroup] = useState("")

  const liveDate = now ? todayStringFromDate(now) : todayString()
  useEffect(() => {
    setNow(new Date())
    window.localStorage.setItem(QR_ACCESS_STORAGE_KEY, String(Date.now() + QR_ACCESS_MINUTES * 60 * 1000))
    const remembered = readRememberedMemberDevice()
    setRememberedToken(remembered.token)
    setRememberedMemberId(remembered.memberId)
    setRememberedFirstName(remembered.firstName)
    setRememberedLastName(remembered.lastName)
    setRememberedCompetitionMember(remembered.isCompetitionMember)
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

  const hasRememberedDevice = Boolean(rememberedToken && rememberedMemberId && rememberedFirstName && rememberedLastName)

  function updateRememberedDevice(payload: {
    token: string
    rememberUntil: number
    member: {
      id: string
      firstName: string
      lastName: string
      isCompetitionMember: boolean
    }
  }) {
    persistRememberedMemberDevice({
      token: payload.token,
      rememberUntil: payload.rememberUntil,
      memberId: payload.member.id,
      firstName: payload.member.firstName,
      lastName: payload.member.lastName,
      isCompetitionMember: payload.member.isCompetitionMember,
    })
    setRememberedToken(payload.token)
    setRememberedMemberId(payload.member.id)
    setRememberedFirstName(payload.member.firstName)
    setRememberedLastName(payload.member.lastName)
    setRememberedCompetitionMember(payload.member.isCompetitionMember)
  }

  function forgetRememberedDevice() {
    clearRememberedMemberDevice()
    setRememberedToken("")
    setRememberedMemberId("")
    setRememberedFirstName("")
    setRememberedLastName("")
    setRememberedCompetitionMember(false)
    setRememberedWeight("")
  }

  async function handleMemberCheckin() {
    const email = memberEmail.trim().toLowerCase()
    const firstName = memberFirstName.trim()
    const lastName = memberLastName.trim()
    const pin = memberPin.trim()
    const isBoxzwergeCheckin = selectedSession?.group === "Boxzwerge"

    if (!isBoxzwergeCheckin && (!email || !pin)) {
      alert("Bitte E-Mail und PIN eingeben.")
      return
    }

    if (isBoxzwergeCheckin && (!firstName || !lastName)) {
      alert("Bitte Vorname und Nachname eingeben.")
      return
    }

    if (isBoxzwergeCheckin && !memberBirthDate) {
      alert("Bitte das Geburtsdatum des Boxzwergs eingeben.")
      return
    }

    if (!isBoxzwergeCheckin && !isValidPin(pin)) {
      alert(PIN_REQUIREMENTS_MESSAGE)
      return
    }

    if (!selectedSession) {
      alert("Bitte eine Trainingsgruppe auswählen.")
      return
    }

    try {
      setDbLoading(true)
      const response = await fetch("/api/public/member-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          pin,
          birthDate: memberBirthDate,
          weight: memberWeight.trim(),
          sessionId: selectedSession.id,
          rememberDevice,
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        alert(message || "Fehler beim Speichern des Check-ins.")
        return
      }

      const result = (await response.json()) as {
        rememberToken?: string | null
        rememberUntil?: number | null
        member?: {
          id: string
          firstName: string
          lastName: string
          isCompetitionMember: boolean
        } | null
      }

      if (rememberDevice && result.rememberToken && result.rememberUntil && result.member) {
        updateRememberedDevice({
          token: result.rememberToken,
          rememberUntil: result.rememberUntil,
          member: result.member,
        })
      }

      alert("Check-in erfolgreich gespeichert.")
      setMemberEmail("")
      setMemberFirstName("")
      setMemberLastName("")
      setMemberPin("")
      setMemberBirthDate("")
      setMemberWeight("")
    } catch (error) {
      console.error(error)
      alert("Fehler beim Speichern des Check-ins.")
    } finally {
      setDbLoading(false)
    }
  }

  async function handleFastCheckin() {
    if (!hasRememberedDevice) {
      alert("Es ist noch kein Geraet fuer den Schnell-Check-in gespeichert.")
      return
    }

    if (!selectedSession) {
      alert("Bitte eine Trainingsgruppe auswaehlen.")
      return
    }

    try {
      setFastCheckinLoading(true)
      const response = await fetch("/api/public/member-fast-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: rememberedToken,
          sessionId: selectedSession.id,
          weight: rememberedWeight.trim(),
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        if (response.status === 401 || response.status === 404) {
          forgetRememberedDevice()
        }
        alert(message || "Fehler beim Schnell-Check-in.")
        return
      }

      const result = (await response.json()) as {
        rememberToken: string
        rememberUntil: number
        member: {
          id: string
          firstName: string
          lastName: string
          isCompetitionMember: boolean
        }
      }

      updateRememberedDevice({
        token: result.rememberToken,
        rememberUntil: result.rememberUntil,
        member: result.member,
      })
      setRememberedWeight("")
      alert("Check-in erfolgreich gespeichert.")
    } catch (error) {
      console.error(error)
      alert("Fehler beim Schnell-Check-in.")
    } finally {
      setFastCheckinLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-4 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded-[24px] bg-white p-3 shadow-sm">
          <div className="rounded-2xl bg-[#154c83] px-3 py-2 text-sm font-semibold text-white">Mitglied</div>
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
                    <Users className="h-4 w-4" />
                    Mitglieder-Check-in
                  </div>
                  <h1 className="text-xl font-bold tracking-tight sm:text-3xl">Mitglied einchecken</h1>
                  <p className="mt-2 text-sm leading-6 text-blue-50/90 sm:text-base">
                    Bestehende Mitglieder werden hier direkt für die aktuelle Einheit eingecheckt.
                  </p>
                </div>
              </div>
              <Card className="rounded-[24px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                <CardContent className="p-5">
                  <div className="rounded-2xl bg-white/10 p-3 text-sm">
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
            <CardTitle>Mitglieder-Check-in</CardTitle>
          </CardHeader>
          <CardContent>
            {hasRememberedDevice ? (
              <div className="mb-5 rounded-[24px] border border-[#cfe0ef] bg-[#f4f9ff] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#154c83]">
                      <Smartphone className="h-4 w-4" />
                      Fast-Check-in
                    </div>
                    <div className="mt-3 text-lg font-semibold text-zinc-900">
                      Als {rememberedFirstName} {rememberedLastName} einchecken
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">Dieses Geraet ist gespeichert. Ein Tap reicht fuer den naechsten Check-in.</p>
                  </div>
                  <Button type="button" variant="outline" className="rounded-2xl" onClick={forgetRememberedDevice}>
                    Geraet vergessen
                  </Button>
                </div>

                {rememberedCompetitionMember ? (
                  <div className="mt-4 space-y-2">
                    <Label>Gewicht in kg</Label>
                    <Input
                      value={rememberedWeight}
                      onChange={(e) => setRememberedWeight(e.target.value)}
                      placeholder="z. B. 72,4"
                      className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                    <div className="text-xs text-zinc-500">Fuer Sportler aus der Wettkampfliste bleibt das Gewicht auch im Schnell-Check-in Pflicht.</div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <Button
                    type="button"
                    className="h-12 w-full rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                    disabled={fastCheckinLoading || dbLoading || !selectedSession}
                    onClick={() => {
                      void handleFastCheckin()
                    }}
                  >
                    {fastCheckinLoading ? "Speichert..." : `Schnell einchecken als ${rememberedFirstName}`}
                  </Button>
                </div>
              </div>
            ) : null}

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleMemberCheckin()
              }}
            >
              {selectedSession?.group === "Boxzwerge" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Vorname</Label>
                    <Input value={memberFirstName} onChange={(e) => setMemberFirstName(e.target.value)} placeholder="Vorname" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nachname</Label>
                    <Input value={memberLastName} onChange={(e) => setMemberLastName(e.target.value)} placeholder="Nachname" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>E-Mail</Label>
                  <Input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="name@tsv-falkensee.de" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </div>
              )}

              <div className="space-y-2">
                <Label>{selectedSession?.group === "Boxzwerge" ? "Geburtsdatum des Boxzwergs" : "PIN"}</Label>
                {selectedSession?.group === "Boxzwerge" ? (
                  <Input type="date" value={memberBirthDate} onChange={(e) => setMemberBirthDate(e.target.value)} className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                ) : (
                  <>
                    <PasswordInput value={memberPin} onChange={(e) => setMemberPin(e.target.value)} placeholder="6 bis 16 Zeichen" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                    <div className="text-xs text-zinc-500">{PIN_HINT}</div>
                  </>
                )}
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

              {selectedSession ? (
                <div className="space-y-2">
                  <Label>Gewicht in kg</Label>
                  <Input value={memberWeight} onChange={(e) => setMemberWeight(e.target.value)} placeholder="z. B. 72,4" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </div>
              ) : null}

              {selectedSession?.group === "Boxzwerge" ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  <div className="flex items-center gap-2">
                    <span>Boxzwerge ohne Zugangscode.</span>
                    <InfoHint text="Für Boxzwerge läuft der Check-in ohne Zugangscode über Vorname, Nachname und Geburtsdatum." />
                  </div>
                </div>
              ) : null}


              <label className="flex items-start gap-3 rounded-2xl border border-[#d8e3ee] bg-zinc-50 p-3 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(event) => setRememberDevice(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 accent-[#154c83]"
                />
                <span>
                  Dieses Geraet fuer Fast-Check-in merken.
                  <span className="block text-xs text-zinc-500">Beim naechsten Mal kann das Mitglied direkt mit einem Tap eingecheckt werden.</span>
                </span>
              </label>

              <div className="sticky bottom-3 -mx-1 rounded-[24px] border border-[#d8e3ee] bg-white/95 p-2 shadow-lg backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
                <Button type="submit" className="h-12 w-full rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" disabled={dbLoading || fastCheckinLoading || !selectedSession}>
                  {dbLoading ? "Speichert..." : "Mitglied einchecken"}
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
