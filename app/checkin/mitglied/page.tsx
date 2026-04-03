"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Smartphone, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { sessions } from "@/lib/boxgymSessions"
import { getActiveCheckinSession, parseTimeToDate } from "@/lib/checkinWindow"
import { buildQrAccessHeaders, clearStoredQrAccess, readStoredQrAccess, storeQrAccess } from "@/lib/qrAccessClient"
import { QR_ACCESS_PARAM } from "@/lib/qrAccess"

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
  const [disableCheckinTimeWindow, setDisableCheckinTimeWindow] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)
  const [fastCheckinLoading, setFastCheckinLoading] = useState(false)
  const [qrAccessToken, setQrAccessToken] = useState("")
  const [memberEmail, setMemberEmail] = useState("")
  const [memberPin, setMemberPin] = useState("")
  const [memberWeight, setMemberWeight] = useState("")
  const [rememberDevice, setRememberDevice] = useState(true)
  const [rememberedMemberId, setRememberedMemberId] = useState("")
  const [rememberedFirstName, setRememberedFirstName] = useState("")
  const [rememberedLastName, setRememberedLastName] = useState("")
  const [rememberedCompetitionMember, setRememberedCompetitionMember] = useState(false)
  const [rememberedWeight, setRememberedWeight] = useState("")
  const [selectedSessionId, setSelectedSessionId] = useState<string>("")
  const [showSessionSelect, setShowSessionSelect] = useState(false)
  const [requestedGroup, setRequestedGroup] = useState("")

  const liveDate = now ? todayStringFromDate(now) : todayString()
  useEffect(() => {
    setNow(new Date())
    const params = new URLSearchParams(window.location.search)
    setRequestedGroup(params.get("group")?.trim() ?? "")
    const storedQrAccess = readStoredQrAccess("member")

    const qrToken = params.get(QR_ACCESS_PARAM)?.trim() ?? ""
    const initialQrAccessToken = qrToken || storedQrAccess?.token || ""
    setQrAccessToken(initialQrAccessToken)

    if (qrToken) {
      void (async () => {
        try {
          const response = await fetch(`/api/qr-access?panel=member&${QR_ACCESS_PARAM}=${encodeURIComponent(qrToken)}`)
          if (!response.ok) {
            clearStoredQrAccess("member")
            setQrAccessToken("")
            console.error("member qr access validation failed", response.status)
            return
          }

          const result = (await response.json()) as { accessUntil?: number }
          const accessUntil = result.accessUntil ?? Date.now()
          storeQrAccess("member", qrToken, accessUntil)
          setQrAccessToken(qrToken)

          params.delete(QR_ACCESS_PARAM)
          params.delete("panel")
          const nextQuery = params.toString()
          window.history.replaceState(null, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`)
        } catch (error) {
          clearStoredQrAccess("member")
          setQrAccessToken("")
          console.error("member qr access validation failed", error)
        }
      })()
    }

    void (async () => {
      try {
        const response = await fetch("/api/public/checkin-settings", { cache: "no-store" })
        if (response.ok) {
          const result = (await response.json()) as { disableCheckinTimeWindow?: boolean }
          setDisableCheckinTimeWindow(Boolean(result.disableCheckinTimeWindow))
        }
      } catch (error) {
        console.error("member checkin settings loading failed", error)
      }
    })()

    void (async () => {
      try {
        const response = await fetch("/api/public/member-fast-checkin", {
          method: "GET",
          headers: buildQrAccessHeaders(initialQrAccessToken),
        })
        if (!response.ok) return

        const result = (await response.json()) as {
          remembered?: boolean
          member?: {
            id: string
            firstName: string
            lastName: string
            isCompetitionMember: boolean
          }
        }

        if (!result.remembered || !result.member) return

        setRememberedMemberId(result.member.id)
        setRememberedFirstName(result.member.firstName)
        setRememberedLastName(result.member.lastName)
        setRememberedCompetitionMember(result.member.isCompetitionMember)
      } catch (error) {
        console.error("remembered device restore failed", error)
      }
    })()
  }, [])

  const todaysSessions = useMemo(() => {
    const dayKey = getDayKey(liveDate)
    return sessions.filter((session) => session.dayKey === dayKey)
  }, [liveDate])

  const displaySessions = useMemo(() => {
    if (!requestedGroup) return todaysSessions
    return todaysSessions.filter((session) => session.group === requestedGroup)
  }, [requestedGroup, todaysSessions])

  const activeSession = useMemo(() => {
    if (!now) return null
    if (disableCheckinTimeWindow) return null
    return getActiveCheckinSession(now, displaySessions)
  }, [disableCheckinTimeWindow, displaySessions, now])

  const nextSession = useMemo(() => {
    if (!now) return null
    return (
      displaySessions
        .map((session) => ({
          session,
          startDate: parseTimeToDate(session.start, now),
        }))
        .filter(({ startDate }) => startDate.getTime() > now.getTime())
        .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())[0]?.session ?? null
    )
  }, [displaySessions, now])

  const autoSession = activeSession ?? nextSession
  const selectedSession =
    displaySessions.find((session) => session.id === selectedSessionId) ?? autoSession ?? displaySessions[0] ?? null
  const checkinAllowed = disableCheckinTimeWindow ? displaySessions.length > 0 : Boolean(activeSession)

  useEffect(() => {
    if (displaySessions.length === 0) {
      setSelectedSessionId("")
      setShowSessionSelect(true)
      return
    }

    const exists = displaySessions.some((session) => session.id === selectedSessionId)
    if (exists) return

    if (autoSession) {
      setSelectedSessionId(autoSession.id)
      setShowSessionSelect(false)
      return
    }

    setSelectedSessionId(displaySessions[0].id)
    setShowSessionSelect(true)
  }, [autoSession, displaySessions, selectedSessionId])

  const hasRememberedDevice = Boolean(rememberedMemberId && rememberedFirstName && rememberedLastName)

  function updateRememberedDevice(payload: {
    member: {
      id: string
      firstName: string
      lastName: string
      isCompetitionMember: boolean
    }
  }) {
    setRememberedMemberId(payload.member.id)
    setRememberedFirstName(payload.member.firstName)
    setRememberedLastName(payload.member.lastName)
    setRememberedCompetitionMember(payload.member.isCompetitionMember)
  }

  function forgetRememberedDevice() {
    void fetch("/api/public/member-fast-checkin", { method: "DELETE" })
    setRememberedMemberId("")
    setRememberedFirstName("")
    setRememberedLastName("")
    setRememberedCompetitionMember(false)
    setRememberedWeight("")
  }

  async function handleMemberCheckin() {
    const email = memberEmail.trim().toLowerCase()
    const pin = memberPin.trim()

    if (!email || !pin) {
      alert("Bitte E-Mail und Passwort eingeben.")
      return
    }

    if (!selectedSession) {
      alert("Bitte eine Trainingsgruppe auswählen.")
      return
    }

    if (!checkinAllowed) {
      alert("Check-in aktuell nur 30 Minuten vor bis 30 Minuten nach Trainingsbeginn möglich.")
      return
    }

    try {
      setDbLoading(true)
      const response = await fetch("/api/public/member-checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQrAccessHeaders(qrAccessToken),
        },
        body: JSON.stringify({
          email,
          password: pin,
          weight: memberWeight.trim(),
          sessionId: selectedSession.id,
          rememberDevice,
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        if (response.status === 403) {
          clearStoredQrAccess("member")
          setQrAccessToken("")
        }
        alert(message || "Fehler beim Speichern des Check-ins.")
        return
      }

      const result = (await response.json()) as {
        rememberUntil?: number | null
        member?: {
          id: string
          firstName: string
          lastName: string
          isCompetitionMember: boolean
        } | null
      }

      if (rememberDevice && result.rememberUntil && result.member) {
        updateRememberedDevice({
          member: result.member,
        })
      }

      alert("Check-in erfolgreich gespeichert.")
      setMemberEmail("")
      setMemberPin("")
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
      alert("Es ist noch kein Gerät für den Schnell-Check-in gespeichert.")
      return
    }

    if (!selectedSession) {
      alert("Bitte eine Trainingsgruppe auswählen.")
      return
    }

    if (!checkinAllowed) {
      alert("Check-in aktuell nur 30 Minuten vor bis 30 Minuten nach Trainingsbeginn möglich.")
      return
    }

    try {
      setFastCheckinLoading(true)
      const response = await fetch("/api/public/member-fast-checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQrAccessHeaders(qrAccessToken),
        },
        body: JSON.stringify({
          sessionId: selectedSession.id,
          weight: rememberedWeight.trim(),
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        if (response.status === 401 || response.status === 404) {
          forgetRememberedDevice()
        }
        if (response.status === 403) {
          clearStoredQrAccess("member")
          setQrAccessToken("")
        }
        alert(message || "Fehler beim Schnell-Check-in.")
        return
      }

      const result = (await response.json()) as {
        rememberUntil: number
        member: {
          id: string
          firstName: string
          lastName: string
          isCompetitionMember: boolean
        }
      }

      updateRememberedDevice({
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
                  src="/boxgym-headline-old.png"
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
                  {disableCheckinTimeWindow ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-200">Ferienmodus aktiv</p>
                  ) : null}
                </div>
              </div>
              <Card className="rounded-[24px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur">
                <CardContent className="p-5">
                  <div className="rounded-2xl bg-white/10 p-3 text-sm">
                    <div className="text-zinc-300">{activeSession ? "Aktive Einheit" : nextSession ? "Nächste Einheit" : "Aktuelle Einheit"}</div>
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
            {!checkinAllowed ? (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Check-in ist aktuell nur 30 Minuten vor bis 30 Minuten nach Trainingsbeginn möglich.
              </div>
            ) : null}

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
                    <p className="mt-1 text-sm text-zinc-600">Dieses Gerät ist gespeichert. Ein Tap reicht für den nächsten Check-in.</p>
                  </div>
                  <Button type="button" variant="outline" className="rounded-2xl" onClick={forgetRememberedDevice}>
                    Ausloggen
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
                    <div className="text-xs text-zinc-500">Für Sportler aus der Wettkampfliste bleibt das Gewicht auch im Schnell-Check-in Pflicht.</div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <Button
                    type="button"
                    className="h-12 w-full rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                    disabled={fastCheckinLoading || dbLoading || !selectedSession || !checkinAllowed}
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
              <div className="space-y-2">
                <Label>E-Mail</Label>
                <Input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="name@tsv-falkensee.de" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
              </div>

              <div className="space-y-2">
                <Label>Passwort</Label>
                <>
                  <PasswordInput value={memberPin} onChange={(e) => setMemberPin(e.target.value)} placeholder="Passwort" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
                </>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Trainingsgruppe</Label>
                  {displaySessions.length > 0 && autoSession ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto rounded-xl px-2 py-1 text-xs text-[#154c83]"
                      onClick={() => setShowSessionSelect((prev) => !prev)}
                    >
                      {showSessionSelect ? "Auswahl schließen" : "Einheit ändern"}
                    </Button>
                  ) : null}
                </div>
                {!showSessionSelect && selectedSession ? (
                  <div className="rounded-2xl border border-[#d8e3ee] bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                    <div className="font-semibold text-zinc-900">{selectedSession.group}</div>
                    <div className="mt-1 text-zinc-500">{selectedSession.start} – {selectedSession.end}</div>
                  </div>
                ) : (
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
                )}
              </div>

              {selectedSession ? (
                <div className="space-y-2">
                  <Label>Gewicht in kg</Label>
                  <Input value={memberWeight} onChange={(e) => setMemberWeight(e.target.value)} placeholder="z. B. 72,4" className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900" />
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
                  Dieses Gerät für Fast-Check-in merken.
                  <span className="block text-xs text-zinc-500">Beim nächsten Mal kann das Mitglied direkt mit einem Tap eingecheckt werden.</span>
                </span>
              </label>

              <div className="sticky bottom-3 -mx-1 rounded-[24px] border border-[#d8e3ee] bg-white/95 p-2 shadow-lg backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
                <Button type="submit" className="h-12 w-full rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" disabled={dbLoading || fastCheckinLoading || !selectedSession || !checkinAllowed}>
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
