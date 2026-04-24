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
import { getMemberCheckinMode, getSessionsForDate, isAdultBaseGroup, resolveMemberCheckinAssignment } from "@/lib/memberCheckin"
import { buildQrAccessHeaders, clearStoredQrAccess, readStoredQrAccess, storeQrAccess } from "@/lib/qrAccessClient"
import { QR_ACCESS_PARAM } from "@/lib/qrAccess"

function todayString() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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
  const [rememberedBaseGroup, setRememberedBaseGroup] = useState("")
  const [rememberedCompetitionMember, setRememberedCompetitionMember] = useState(false)
  const [rememberedWeight, setRememberedWeight] = useState("")
  const [checkinDone, setCheckinDone] = useState("")
  const [checkinError, setCheckinError] = useState("")

  const liveDate = now ? todayStringFromDate(now) : todayString()

  useEffect(() => {
    setNow(new Date())
    const params = new URLSearchParams(window.location.search)
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
            if (process.env.NODE_ENV !== "production") {
              console.error("member qr access validation failed", response.status)
            }
            return
          }

          const result = (await response.json()) as { accessUntil?: number; token?: string }
          const accessUntil = result.accessUntil ?? Date.now()
          const validatedToken = result.token?.trim() || qrToken
          storeQrAccess("member", validatedToken, accessUntil)
          setQrAccessToken(validatedToken)

          params.delete(QR_ACCESS_PARAM)
          params.delete("panel")
          const nextQuery = params.toString()
          window.history.replaceState(null, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`)
        } catch (error) {
          clearStoredQrAccess("member")
          setQrAccessToken("")
          if (process.env.NODE_ENV !== "production") {
            console.error("member qr access validation failed", error)
          }
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
        if (process.env.NODE_ENV !== "production") {
          console.error("member checkin settings loading failed", error)
        }
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
            baseGroup?: string
            isCompetitionMember: boolean
          }
        }

        if (!result.remembered || !result.member) return

        setRememberedMemberId(result.member.id)
        setRememberedFirstName(result.member.firstName)
        setRememberedLastName(result.member.lastName)
        setRememberedBaseGroup(result.member.baseGroup?.trim() ?? "")
        setRememberedCompetitionMember(result.member.isCompetitionMember)
      } catch (error) {
        console.error("remembered device restore failed", error)
      }
    })()
  }, [])

  const todaysSessions = useMemo(() => getSessionsForDate(liveDate), [liveDate])
  const checkinMode = useMemo(() => getMemberCheckinMode(disableCheckinTimeWindow), [disableCheckinTimeWindow])

  const rememberedAssignment = useMemo(() => {
    if (!now || !rememberedBaseGroup) return null
    return resolveMemberCheckinAssignment({
      dailySessions: todaysSessions,
      now,
      baseGroup: rememberedBaseGroup,
      mode: checkinMode,
    })
  }, [checkinMode, now, rememberedBaseGroup, todaysSessions])
  const rememberedNeedsWeight = rememberedCompetitionMember || rememberedAssignment?.groupName === "L-Gruppe"

  const hasRememberedDevice = Boolean(rememberedMemberId && rememberedFirstName && rememberedLastName)

  function showCheckinSuccess(name?: string) {
    setCheckinDone(name ? `Geschafft! ${name} ist eingecheckt.` : "Geschafft! Check-in eingetragen.")
    // Erfolgsmeldung bleibt 6 Sekunden sichtbar
    window.setTimeout(() => setCheckinDone(""), 6000)
  }

  function updateRememberedDevice(payload: {
    member: {
      id: string
      firstName: string
      lastName: string
      baseGroup?: string
      isCompetitionMember: boolean
    }
  }) {
    setRememberedMemberId(payload.member.id)
    setRememberedFirstName(payload.member.firstName)
    setRememberedLastName(payload.member.lastName)
    setRememberedBaseGroup(payload.member.baseGroup?.trim() ?? "")
    setRememberedCompetitionMember(payload.member.isCompetitionMember)
  }

  function forgetRememberedDevice() {
    void fetch("/api/public/member-fast-checkin", { method: "DELETE" })
    setRememberedMemberId("")
    setRememberedFirstName("")
    setRememberedLastName("")
    setRememberedBaseGroup("")
    setRememberedCompetitionMember(false)
    setRememberedWeight("")
  }

  async function handleMemberCheckin() {
    const email = memberEmail.trim().toLowerCase()
    const pin = memberPin.trim()

    if (!email || !pin) {
      setCheckinError("Bitte E-Mail und Passwort eingeben.")
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    // Einfache E-Mail Plausibilität
    if (!email.includes("@")) {
      setCheckinError("Bitte gültige E-Mail eingeben")
      return
    }
    // Gewicht nur prüfen, wenn relevant
    if ((rememberedCompetitionMember || rememberedAssignment?.groupName === "L-Gruppe") && memberWeight && isNaN(Number(memberWeight))) {
      setCheckinError("Gewicht muss eine Zahl sein")
      return
    }
    setCheckinError("")

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
          qrAccessToken,
          weight: memberWeight.trim(),
          rememberDevice,
        }),
      })

      const result = (await response.json()) as {
        ok?: boolean
        error?: string
        reason?: string
        rememberUntil?: number | null
        member?: {
          id: string
          firstName: string
          lastName: string
          baseGroup?: string
          isCompetitionMember: boolean
        } | null
      }

      if (!response.ok || !result.ok) {
        let errorMessage = "Fehler beim Speichern des Check-ins."
        if (typeof result.reason === "string") {
          switch (result.reason) {
            case "email_not_verified":
              errorMessage = "Deine E-Mail-Adresse ist noch nicht bestätigt. Bitte bestätige zuerst den Link aus der E-Mail."
              break
            case "member_not_found":
              errorMessage = "Dein Mitgliedskonto wurde nicht gefunden. Bitte melde dich beim Trainer oder im Verein."
              break
            case "group_not_allowed":
              errorMessage = "Für dich wurde aktuell keine passende Trainingseinheit gefunden."
              break
            case "outside_time_window":
              errorMessage = "Check-in ist nur im freigegebenen Zeitfenster möglich."
              break
            case "LIMIT_TRIAL":
              errorMessage = "Du hast die maximale Anzahl an Probetrainings erreicht."
              break
            default:
              errorMessage = result.error || "Fehler beim Speichern des Check-ins."
          }
        } else if (result.error) {
          errorMessage = result.error
        }

        if (response.status === 403) {
          clearStoredQrAccess("member")
          setQrAccessToken("")
        }
        setCheckinError(errorMessage)
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }

      if (rememberDevice && result.rememberUntil && result.member) {
        updateRememberedDevice({ member: result.member })
      }

      showCheckinSuccess(result.member?.firstName || undefined)
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
    try {
      setFastCheckinLoading(true)
      const response = await fetch("/api/public/member-fast-checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQrAccessHeaders(qrAccessToken),
        },
        body: JSON.stringify({
          qrAccessToken,
          weight: rememberedWeight.trim(),
        }),
      })

      const result = (await response.json()) as {
        ok?: boolean
        error?: string
        reason?: string
        rememberUntil?: number
        member?: {
          id: string
          firstName: string
          lastName: string
          isCompetitionMember: boolean
        }
      }

      if (!response.ok || !result.ok) {
        let errorMessage = "Fehler beim Schnell-Check-in."
        if (typeof result.reason === "string") {
          switch (result.reason) {
            case "email_not_verified":
              errorMessage = "Deine E-Mail-Adresse ist noch nicht bestätigt. Bitte bestätige zuerst den Link aus der E-Mail."
              break
            case "member_not_found":
              errorMessage = "Dein Mitgliedskonto wurde nicht gefunden. Bitte melde dich beim Trainer oder im Verein."
              break
            case "group_not_allowed":
              errorMessage = "Für dich wurde aktuell keine passende Trainingseinheit gefunden."
              break
            case "outside_time_window":
              errorMessage = "Check-in ist nur im freigegebenen Zeitfenster möglich."
              break
            case "LIMIT_TRIAL":
              errorMessage = "Du hast die maximale Anzahl an Probetrainings erreicht."
              break
            default:
              errorMessage = result.error || "Fehler beim Schnell-Check-in."
          }
        } else if (result.error) {
          errorMessage = result.error
        }

        if (response.status === 401 || response.status === 404) {
          forgetRememberedDevice()
        }
        if (response.status === 403) {
          clearStoredQrAccess("member")
          setQrAccessToken("")
        }
        setCheckinError(errorMessage)
        return
      }

      if (result.member) {
        updateRememberedDevice({ member: result.member })
      }
      setRememberedWeight("")
      showCheckinSuccess(result.member?.firstName)
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
          <div className="rounded-2xl bg-[#154c83] px-3 py-2 text-sm font-semibold text-white">Mitglied Check-in</div>
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
                  <p className="mt-2 hidden text-sm leading-6 text-blue-50/90 sm:block sm:text-base">
                    {checkinMode === "ferien"
                      ? "Ferienbetrieb - freie Zeiten. Der Check-in läuft über die Stammgruppe."
                      : "Check-in nur während Trainingszeit. Die laufende Gruppe wird automatisch gesetzt."}
                  </p>
                  {checkinMode === "ferien" ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-200">Ferienmodus aktiv</p>
                  ) : hasRememberedDevice && isAdultBaseGroup(rememberedBaseGroup) ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-200">Ü18 jederzeit möglich</p>
                  ) : null}
                </div>
              </div>
              <Card className="hidden rounded-[24px] border-white/10 bg-white/5 text-white shadow-none backdrop-blur md:block">
                <CardContent className="p-5">
                  <div className="rounded-2xl bg-white/10 p-3 text-sm">
                    <div className="text-zinc-300">Check-in-Gruppe</div>
                    <div className="mt-1 font-semibold">
                      {hasRememberedDevice
                        ? rememberedAssignment?.groupName || rememberedBaseGroup || "Wird automatisch ermittelt"
                        : checkinMode === "ferien"
                          ? "Stammgruppe nach Anmeldung"
                          : "Laufende Gruppe nach Anmeldung"}
                    </div>
                    <div className="mt-1 text-zinc-300">
                      {hasRememberedDevice && rememberedAssignment?.session
                        ? `${rememberedAssignment.session.start} – ${rememberedAssignment.session.end}`
                        : checkinMode === "ferien"
                          ? "Im Ferienmodus wird immer die Stammgruppe verwendet."
                          : "Im Normalbetrieb ist Check-in nur im Zeitfenster einer laufenden Gruppe möglich."}
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
            {checkinDone ? (
              <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                ✓ {checkinDone}
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
                    <p className="mt-1 text-sm text-zinc-600">
                      Dieses Gerät ist gespeichert. Ein Tap genügt.
                      {rememberedBaseGroup ? ` Gruppe: ${rememberedAssignment?.groupName || rememberedBaseGroup}.` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl"
                    title="Beendet nur den Geräte-/Check-in-Status, nicht den Login"
                    onClick={forgetRememberedDevice}
                  >
                    Gerät abmelden
                  </Button>
                </div>

                {rememberedNeedsWeight ? (
                  <div className="mt-4 space-y-2">
                    <Label>Gewicht in kg</Label>
                    <Input
                      value={rememberedWeight}
                      onChange={(e) => setRememberedWeight(e.target.value)}
                      placeholder="z. B. 72,4"
                      className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                    />
                    <div className="text-xs text-zinc-500">Pflichtfeld für L-Gruppe und Wettkampfsportler.</div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <Button
                    type="button"
                    className="h-12 w-full rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]"
                    disabled={fastCheckinLoading || dbLoading || !rememberedAssignment?.allowed}
                    onClick={() => {
                      void handleFastCheckin()
                    }}
                  >
                    {fastCheckinLoading ? "Speichert..." : `Schnell einchecken als ${rememberedFirstName}`}
                  </Button>
                  {!rememberedAssignment?.allowed ? (
                    <p className="mt-2 text-center text-xs text-zinc-400">
                      {checkinMode === "ferien"
                        ? "Keine Stammgruppe hinterlegt – bitte normal einchecken."
                        : "Aktuell außerhalb des Check-in-Zeitfensters."}
                    </p>
                  ) : null}
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
                <Input
                  type="email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="name@tsv-falkensee.de"
                  className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  autoFocus
                  inputMode="email"
                  autoComplete="email"
                  enterKeyHint="next"
                />
              </div>

              <div className="space-y-2">
                <Label>Passwort</Label>
                <PasswordInput
                  value={memberPin}
                  onChange={(e) => setMemberPin(e.target.value)}
                  placeholder="Passwort"
                  className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  inputMode="numeric"
                  enterKeyHint="done"
                />
              </div>

              {(rememberedCompetitionMember || rememberedAssignment?.groupName === "L-Gruppe") && (
                <div className="space-y-2">
                  <Label>Gewicht in kg</Label>
                  <Input
                    value={memberWeight}
                    onChange={(e) => setMemberWeight(e.target.value)}
                    placeholder="z. B. 72,4"
                    className="h-12 rounded-2xl border-zinc-300 bg-white text-zinc-900"
                  />
                  <div className="text-xs text-zinc-500">Pflichtfeld für L-Gruppe und Wettkampfsportler.</div>
                </div>
              )}

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
                {checkinError ? (
                  <p className="mb-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 md:mb-3">
                    {checkinError}
                  </p>
                ) : null}
                <Button type="submit" className="h-12 w-full rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" disabled={dbLoading || fastCheckinLoading}>
                  {dbLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                      Speichert...
                    </span>
                  ) : "Mitglied einchecken"}
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
