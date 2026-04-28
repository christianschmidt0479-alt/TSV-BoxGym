"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { Smartphone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { getMemberCheckinMode, getSessionsForDate, resolveMemberCheckinAssignment } from "@/lib/memberCheckin"
import { isWeightRequiredGroup, needsWeight } from "@/lib/memberUtils"
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
  const router = useRouter()
  const [skipAutoCheckin, setSkipAutoCheckin] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [disableCheckinTimeWindow, setDisableCheckinTimeWindow] = useState(false)
  const [disableNormalCheckinTimeWindow, setDisableNormalCheckinTimeWindow] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)
  const [fastCheckinLoading, setFastCheckinLoading] = useState(false)
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [success, setSuccess] = useState(false)
  const [softProgress, setSoftProgress] = useState(false)
  const [error, setError] = useState(false)
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
  const [checkinSuccessName, setCheckinSuccessName] = useState("")
  const [checkinError, setCheckinError] = useState("")
  const [availableGroups, setAvailableGroups] = useState<Array<{ group: string; time: string }>>([])
  const [selectedGroup, setSelectedGroup] = useState("")
  const [nfcDetected, setNfcDetected] = useState(false)
  const [qrTokenStatus, setQrTokenStatus] = useState<"idle" | "valid" | "invalid">("idle")
  const [initialFastCheckinResolved, setInitialFastCheckinResolved] = useState(false)
  const [autoCheckinRunning, setAutoCheckinRunning] = useState(false)
  const [autoCheckinFailed, setAutoCheckinFailed] = useState(false)
  const [member, setMember] = useState<{ id: string; base_group: string | null; is_wettkaempfer: boolean; weight: string | null } | null>(null)

  const emailInputRef = useRef<HTMLInputElement | null>(null)
  const hasTriggered = useRef(false)
  const waitGuardTimerRef = useRef<number | null>(null)
  const timeoutTimerRef = useRef<number | null>(null)
  const successRef = useRef(false)
  const errorRef = useRef(false)

  const liveDate = now ? todayStringFromDate(now) : todayString()

  useEffect(() => {
    setNow(new Date())
    const params = new URLSearchParams(window.location.search)
    const skipAuto = params.get("skipAutoCheckin") === "1"
    if (skipAuto) {
      setSkipAutoCheckin(true)
      hasTriggered.current = true
      params.delete("skipAutoCheckin")
      const nextQuery = params.toString()
      window.history.replaceState(null, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`)
    }
    setNfcDetected(params.get("source")?.trim().toLowerCase() === "nfc")
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
          const result = (await response.json()) as {
            disableCheckinTimeWindow?: boolean
            disableNormalCheckinTimeWindow?: boolean
          }
          setDisableCheckinTimeWindow(Boolean(result.disableCheckinTimeWindow))
          setDisableNormalCheckinTimeWindow(Boolean(result.disableNormalCheckinTimeWindow))
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
        if (process.env.NODE_ENV !== "production") {
          console.error("remembered device restore failed", error)
        }
      } finally {
        setInitialFastCheckinResolved(true)
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
  const rememberedNeedsWeight = rememberedCompetitionMember || isWeightRequiredGroup(rememberedAssignment?.groupName)
  const showRegistrationHint =
    autoCheckinFailed ||
    checkinError.toLowerCase().includes("nicht gefunden") ||
    checkinError.toLowerCase().includes("mitgliedskonto") ||
    checkinError.toLowerCase().includes("nicht erkannt")

  const hasRememberedDevice = Boolean(rememberedMemberId && rememberedFirstName && rememberedLastName)
  const showManualForm = !hasRememberedDevice

  function startWaitGuard() {
    if (waitGuardTimerRef.current !== null) {
      window.clearTimeout(waitGuardTimerRef.current)
    }
    setSoftProgress(false)
    waitGuardTimerRef.current = window.setTimeout(() => {
      if (!successRef.current) {
        setSoftProgress(true)
      }
    }, 1200)
  }

  function stopWaitGuard() {
    if (waitGuardTimerRef.current !== null) {
      window.clearTimeout(waitGuardTimerRef.current)
      waitGuardTimerRef.current = null
    }
  }

  function startTimeoutGuard() {
    if (timeoutTimerRef.current !== null) {
      window.clearTimeout(timeoutTimerRef.current)
    }

    timeoutTimerRef.current = window.setTimeout(() => {
      if (!successRef.current && !errorRef.current) {
        console.log("TIMEOUT ERROR")
        markCheckinError("Zeitüberschreitung beim Check-in. Bitte erneut versuchen.")
      }
    }, 6000)
  }

  function stopTimeoutGuard() {
    if (timeoutTimerRef.current !== null) {
      window.clearTimeout(timeoutTimerRef.current)
      timeoutTimerRef.current = null
    }
  }

  function startCheckinProgress() {
    successRef.current = false
    errorRef.current = false
    setSuccess(false)
    setError(false)
    setCheckinError("")
    setIsCheckingIn(true)
    startWaitGuard()
    startTimeoutGuard()
  }

  function markCheckinSuccess() {
    successRef.current = true
    setSuccess(true)
    setError(false)
    setSoftProgress(false)
    setIsCheckingIn(false)
    stopWaitGuard()
    stopTimeoutGuard()
  }

  function markCheckinError(message: string) {
    errorRef.current = true
    setError(true)
    setCheckinError(message)
    setSoftProgress(false)
    setIsCheckingIn(false)
    stopWaitGuard()
    stopTimeoutGuard()
  }

  function resetErrorState() {
    errorRef.current = false
    setError(false)
    setCheckinError("")
  }

  function resetAvailableGroupSelection() {
    setAvailableGroups([])
    setSelectedGroup("")
  }

  function stopCheckinProgressInline() {
    setIsCheckingIn(false)
    setSoftProgress(false)
    stopWaitGuard()
    stopTimeoutGuard()
  }

  useEffect(() => {
    return () => {
      stopWaitGuard()
      stopTimeoutGuard()
    }
  }, [])

  useEffect(() => {
    if (!success || !member) return

    const shouldAskWeight =
      needsWeight(member) && !member.weight

    if (shouldAskWeight) {
      const timer = window.setTimeout(() => {
        sessionStorage.setItem("checkin-weight-member", JSON.stringify(member))
        router.push("/checkin/gewicht")
      }, 1200)

      return () => {
        window.clearTimeout(timer)
      }
    }
  }, [success, member])

  useEffect(() => {
    if (skipAutoCheckin) return
    if (!initialFastCheckinResolved) return
    if (!hasRememberedDevice) return
    if (hasTriggered.current) return

    hasTriggered.current = true
    console.log("AUTO CHECKIN TRIGGERED")
    startCheckinProgress()
    setAutoCheckinRunning(true)
    setAutoCheckinFailed(false)
    setCheckinError("")
    void handleFastCheckin({ auto: true })
  }, [hasRememberedDevice, initialFastCheckinResolved, skipAutoCheckin])

  function showCheckinSuccess(name?: string) {
    setCheckinSuccessName(name || "")
    setCheckinDone(name ? `Geschafft! ${name} ist eingecheckt.` : "Geschafft! Check-in eingetragen.")
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

    if (availableGroups.length > 0 && !selectedGroup) {
      setCheckinError("Bitte wähle eine Gruppe aus, bevor du eincheckst.")
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    // Einfache E-Mail Plausibilität
    if (!email.includes("@")) {
      setCheckinError("Bitte gültige E-Mail eingeben")
      return
    }
    // Gewicht nur prüfen, wenn relevant
    if ((rememberedCompetitionMember || isWeightRequiredGroup(rememberedAssignment?.groupName)) && memberWeight && isNaN(Number(memberWeight))) {
      setCheckinError("Gewicht muss eine Zahl sein")
      return
    }
    // Manual form check-in must not trigger the remembered-device auto fast-checkin effect afterward.
    hasTriggered.current = true
    setCheckinError("")
    startCheckinProgress()

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
          selectedGroup: selectedGroup || undefined,
          rememberDevice,
        }),
      })

      console.log("CHECKIN RESPONSE", response.status)

      const rawBody = await response.text()
      const result = (() => {
        try {
          return JSON.parse(rawBody) as {
            ok?: boolean
            error?: string
            reason?: string
            availableGroups?: Array<{ group: string; time: string }>
            requires_weight_entry_today?: boolean
            rememberUntil?: number | null
            member?: {
              id: string
              firstName: string
              lastName: string
              baseGroup?: string
              isCompetitionMember: boolean
            } | null
          }
        } catch {
          return { error: rawBody?.trim() || undefined }
        }
      })()

      const typedResult = result as {
        ok?: boolean
        error?: string
        reason?: string
        availableGroups?: Array<{ group: string; time: string }>
        requires_weight_entry_today?: boolean
        rememberUntil?: number | null
        member?: {
          id: string
          firstName: string
          lastName: string
          baseGroup?: string
          isCompetitionMember: boolean
        } | null
      }

      if (response.ok) {
        const submittedWeight = memberWeight.trim()
        setMember({
          id: typedResult.member?.id || email,
          base_group: typedResult.member?.baseGroup?.trim() || null,
          is_wettkaempfer: Boolean(typedResult.member?.isCompetitionMember || typedResult.requires_weight_entry_today),
          weight: submittedWeight || null,
        })
        markCheckinSuccess()

        if (rememberDevice && typedResult.rememberUntil && typedResult.member) {
          updateRememberedDevice({ member: typedResult.member })
        }

        showCheckinSuccess(typedResult.member?.firstName || undefined)
        setMemberEmail("")
        setMemberPin("")
        setMemberWeight("")
        resetAvailableGroupSelection()
        return
      }

      if (!response.ok || !typedResult.ok) {
        if (typedResult.reason === "no_own_session_today") {
          setAvailableGroups(Array.isArray(typedResult.availableGroups) ? typedResult.availableGroups : [])
          if (selectedGroup && !Array.isArray(typedResult.availableGroups)) {
            setSelectedGroup("")
          }
          setCheckinError("Heute findet kein Training deiner Gruppe statt. Du kannst eine andere Gruppe auswählen.")
          stopCheckinProgressInline()
          window.scrollTo({ top: 0, behavior: "smooth" })
          return
        }

        resetAvailableGroupSelection()
        let errorMessage = "Fehler beim Speichern des Check-ins."
        if (typeof typedResult.reason === "string") {
          switch (typedResult.reason) {
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
              errorMessage = "Check-in aktuell nicht möglich (Zeitfenster)"
              break
            case "LIMIT_TRIAL":
              errorMessage = "Du hast die maximale Anzahl an Probetrainings erreicht."
              break
            case "DUPLICATE":
              errorMessage = "Bereits eingecheckt"
              break
            default:
              errorMessage = typedResult.error || "Fehler beim Speichern des Check-ins."
          }
        } else if (typedResult.error) {
          errorMessage = typedResult.error
        }

        if (response.status === 403) {
          clearStoredQrAccess("member")
          setQrAccessToken("")
        }
        markCheckinError(errorMessage)
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
    } catch (error) {
      console.error(error)
      markCheckinError("Fehler beim Speichern des Check-ins.")
    } finally {
      if (!successRef.current) {
        setIsCheckingIn(false)
        setSoftProgress(false)
      }
      stopTimeoutGuard()
      setDbLoading(false)
    }
  }

  async function handleFastCheckin(options?: { auto?: boolean }) {
    const isAuto = Boolean(options?.auto)
    try {
      startCheckinProgress()
      if (isAuto) {
        setAutoCheckinRunning(true)
        setAutoCheckinFailed(false)
      }
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

      console.log("CHECKIN RESPONSE", response.status)

      const rawBody = await response.text()
      const result = (() => {
        try {
          return JSON.parse(rawBody) as {
            ok?: boolean
            error?: string
            reason?: string
            availableGroups?: Array<{ group: string; time: string }>
            rememberUntil?: number
            member?: {
              id: string
              firstName: string
              lastName: string
              isCompetitionMember: boolean
            }
          }
        } catch {
          return { error: rawBody?.trim() || undefined }
        }
      })()

      const typedResult = result as {
        ok?: boolean
        error?: string
        reason?: string
        availableGroups?: Array<{ group: string; time: string }>
        rememberUntil?: number
        member?: {
          id: string
          firstName: string
          lastName: string
          isCompetitionMember: boolean
        }
      }

      if (response.ok) {
        const submittedWeight = rememberedWeight.trim()
        setMember({
          id: typedResult.member?.id || rememberedMemberId,
          base_group: rememberedAssignment?.groupName || rememberedBaseGroup || null,
          is_wettkaempfer: Boolean(typedResult.member?.isCompetitionMember || rememberedCompetitionMember),
          weight: submittedWeight || null,
        })
        markCheckinSuccess()
        if (typedResult.member) {
          updateRememberedDevice({ member: typedResult.member })
        }
        setRememberedWeight("")
        showCheckinSuccess(typedResult.member?.firstName)
        return
      }

      if (!response.ok || !typedResult.ok) {
        if (typedResult.reason === "no_own_session_today") {
          setAvailableGroups(Array.isArray(typedResult.availableGroups) ? typedResult.availableGroups : [])
          setSelectedGroup("")
          setCheckinError("Heute findet kein Training deiner Gruppe statt. Du kannst eine andere Gruppe auswählen.")
          setAutoCheckinFailed(true)
          forgetRememberedDevice()
          stopCheckinProgressInline()
          return
        }

        let errorMessage = "Fehler beim Schnell-Check-in."
        if (typeof typedResult.reason === "string") {
          switch (typedResult.reason) {
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
              errorMessage = "Check-in aktuell nicht möglich (Zeitfenster)"
              break
            case "LIMIT_TRIAL":
              errorMessage = "Du hast die maximale Anzahl an Probetrainings erreicht."
              break
            case "DUPLICATE":
              errorMessage = "Bereits eingecheckt"
              break
            default:
              errorMessage = typedResult.error || "Fehler beim Schnell-Check-in."
          }
        } else if (typedResult.error) {
          errorMessage = typedResult.error
        }

        if (response.status === 401 || response.status === 404) {
          forgetRememberedDevice()
          errorMessage = "Nicht erkannt"
        }
        if (response.status === 403) {
          clearStoredQrAccess("member")
          setQrAccessToken("")
        }
        if (isAuto && response.status >= 400) {
          setAutoCheckinFailed(true)
        }
        markCheckinError(errorMessage)
        return
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(error)
      }
      if (isAuto) {
        setAutoCheckinFailed(true)
        markCheckinError("Nicht erkannt")
      } else {
        markCheckinError("Fehler beim Schnell-Check-in.")
      }
    } finally {
      if (!successRef.current) {
        setIsCheckingIn(false)
        setSoftProgress(false)
      }
      stopTimeoutGuard()
      setFastCheckinLoading(false)
      if (isAuto) {
        setAutoCheckinRunning(false)
      }
    }
  }

  if (success || checkinDone) {
    return (
      <div className="min-h-screen bg-emerald-600 px-4 py-8 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col items-center justify-center rounded-[28px] bg-emerald-500/60 p-6 text-center shadow-2xl">
          <p className="text-4xl font-black tracking-tight">Check-in erfolgreich</p>
          {checkinSuccessName ? <p className="mt-3 text-2xl font-semibold">{checkinSuccessName}</p> : null}
          <p className="mt-5 text-base text-emerald-50">Du bist eingecheckt.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-red-600 px-4 py-8 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col items-center justify-center rounded-[28px] bg-red-500/70 p-6 text-center shadow-2xl">
          <p className="text-4xl font-black tracking-tight">Check-in fehlgeschlagen</p>
          <p className="mt-4 text-base text-red-50">{checkinError || "Bitte erneut versuchen."}</p>
          <Button
            type="button"
            className="mt-6 h-14 w-full rounded-2xl bg-white text-lg font-semibold text-red-700 hover:bg-red-50"
            onClick={resetErrorState}
          >
            Erneut versuchen
          </Button>
        </div>
      </div>
    )
  }

  if (isCheckingIn) {
    return (
      <div className="min-h-screen bg-emerald-600 px-4 py-8 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col items-center justify-center rounded-[28px] bg-emerald-500/60 p-6 text-center shadow-2xl">
          <p className="text-4xl font-black tracking-tight">{softProgress ? "Check-in wird gespeichert..." : "Check-in läuft..."}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <Card className="rounded-[24px] border border-[#d8e3ee] bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Check-in</CardTitle>
            <p className="text-sm text-zinc-600">Schnell einchecken ohne extra Klick</p>
            {!initialFastCheckinResolved || autoCheckinRunning ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-center">
                <p className="text-2xl font-extrabold text-blue-900">Check-in läuft...</p>
                <p className="mt-1 text-sm text-blue-700">Bitte kurz warten.</p>
              </div>
            ) : null}
            {qrTokenStatus === "valid" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                Zugang erkannt
              </div>
            ) : qrTokenStatus === "invalid" ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                QR-Code ungültig oder abgelaufen
              </div>
            ) : nfcDetected ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                NFC erkannt – Check-in starten
              </div>
            ) : null}
            {checkinMode === "ferien" ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                Ferienmodus aktiv
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            {hasRememberedDevice ? (
              <div className="mb-5 rounded-[24px] border border-[#cfe0ef] bg-[#f4f9ff] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#154c83]">
                      <Smartphone className="h-4 w-4" />
                      Gerät erkannt – schneller Check-in möglich
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
                      className="h-14 rounded-2xl border-zinc-300 bg-white text-lg text-zinc-900"
                    />
                    <div className="text-xs text-zinc-500">Pflichtfeld für L-Gruppe und Wettkampfsportler.</div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <Button
                    type="button"
                    className="h-16 w-full rounded-2xl bg-[#154c83] text-xl font-semibold text-white hover:bg-[#123d69]"
                    disabled={fastCheckinLoading || dbLoading || !rememberedAssignment?.allowed}
                    onClick={() => {
                      void handleFastCheckin()
                    }}
                  >
                    {fastCheckinLoading ? "Check-in läuft..." : `Jetzt einchecken`}
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

            {showManualForm ? (
              <div className="mb-4">
                <Button
                  type="button"
                  className="h-16 w-full rounded-2xl bg-[#154c83] text-xl font-semibold text-white hover:bg-[#123d69]"
                  onClick={() => emailInputRef.current?.focus()}
                >
                  Jetzt einchecken
                </Button>
              </div>
            ) : null}

            {checkinError ? (
              <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-base text-red-700">
                {checkinError}
              </p>
            ) : null}
            {showRegistrationHint ? (
              <div className="mb-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                <p className="text-base font-bold">Nicht erkannt</p>
                <p className="mt-1">Jetzt registrieren und direkt loslegen.</p>
                <div className="mt-3">
                  <Link
                    href="/registrieren/mitglied"
                    className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-[#154c83] bg-white px-3 text-base font-semibold text-[#154c83]"
                  >
                    Jetzt registrieren
                  </Link>
                </div>
              </div>
            ) : null}

            {showManualForm ? (
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
                  ref={emailInputRef}
                  type="email"
                  value={memberEmail}
                  onChange={(e) => {
                    setMemberEmail(e.target.value)
                    if (availableGroups.length > 0) {
                      resetAvailableGroupSelection()
                    }
                  }}
                  placeholder="name@tsv-falkensee.de"
                  className="h-14 rounded-2xl border-zinc-300 bg-white text-lg text-zinc-900"
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
                  onChange={(e) => {
                    setMemberPin(e.target.value)
                    if (availableGroups.length > 0) {
                      resetAvailableGroupSelection()
                    }
                  }}
                  placeholder="Passwort"
                  className="h-14 rounded-2xl border-zinc-300 bg-white text-lg text-zinc-900"
                  inputMode="numeric"
                  enterKeyHint="done"
                />
              </div>

              {checkinMode === "normal" && availableGroups.length > 0 ? (
                <div className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm font-semibold text-blue-900">
                    Heute findet kein Training deiner Gruppe statt. Du kannst eine andere Gruppe auswählen.
                  </p>
                  <div className="space-y-2">
                    {availableGroups.map((session) => {
                      const optionValue = `${session.group}__${session.time}`
                      const isSelected = selectedGroup === session.group
                      return (
                        <button
                          key={optionValue}
                          type="button"
                          className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
                            isSelected
                              ? "border-[#154c83] bg-white text-[#154c83]"
                              : "border-blue-200 bg-white text-zinc-800 hover:border-blue-300"
                          }`}
                          onClick={() => {
                            setSelectedGroup(session.group)
                            setCheckinError("")
                          }}
                        >
                          {session.group} · {session.time}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {(rememberedCompetitionMember || isWeightRequiredGroup(rememberedAssignment?.groupName)) && (
                <div className="space-y-2">
                  <Label>Gewicht in kg</Label>
                  <Input
                    value={memberWeight}
                    onChange={(e) => setMemberWeight(e.target.value)}
                    placeholder="z. B. 72,4"
                    className="h-14 rounded-2xl border-zinc-300 bg-white text-lg text-zinc-900"
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
                <Button type="submit" className="h-16 w-full rounded-2xl bg-[#154c83] text-xl font-semibold text-white hover:bg-[#123d69]" disabled={dbLoading || fastCheckinLoading}>
                  {dbLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                      Check-in läuft...
                    </span>
                  ) : "Jetzt einchecken"}
                </Button>
              </div>
              </form>
            ) : null}
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
