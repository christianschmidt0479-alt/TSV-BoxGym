"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type ScanEntry = {
  id: number
  value: string
  at: string
}

type ScannerMode = "test" | "member" | "ticket"

type ScannerTestClientProps = {
  mode?: ScannerMode
  mobileApp?: boolean
  enableMemberCheckinAction?: boolean
}

type ResolvedMember = {
  id?: string
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  base_group?: string | null
  is_approved?: boolean | null
  is_trial?: boolean | null
}

type MemberLookupState =
  | {
      state: "idle"
    }
  | {
      state: "loading"
      token: string
    }
  | {
      state: "success"
      token: string
      member: ResolvedMember
    }
  | {
      state: "warning" | "error"
      token: string
      message: string
    }

const READER_ID = "admin-tools-scanner-reader"
const COOLDOWN_MS = 1800
const SUCCESS_STATUS_MS = 2200
const CHECKIN_ACTION_COOLDOWN_MS = 3000
const SCANNER_FPS = 12
const SCANNER_TEST_EVENT = "tsvboxgym:scanner-test-decode"
const ENABLE_SCANNER_TEST_HOOK = process.env.NODE_ENV !== "production"

type StopReason = "manual" | "visibility" | "error"

const MODE_LABEL: Record<ScannerMode, string> = {
  test: "Testmodus",
  member: "Mitglieder-QR prüfen",
  ticket: "Ticket-Modus (vorbereitet)",
}

type ScanMemberQrResponse = {
  member?: ResolvedMember
}

type MemberQrCheckinResponse = {
  status: "success" | "needs_selection" | "needs_weight" | "blocked" | "error"
  message: string
  reason?: string
  availableGroups?: Array<{ group: string; time: string }>
}

type Html5QrcodeInstance = {
  start: (
    cameraConfig: { facingMode: "environment" | "user" } | string,
    configuration?: {
      fps?: number
      qrbox?: { width: number; height: number }
      aspectRatio?: number
      formatsToSupport?: number[]
    },
    qrCodeSuccessCallback?: (decodedText: string) => void,
    qrCodeErrorCallback?: (errorMessage: string) => void,
  ) => Promise<unknown>
  stop: () => Promise<void>
  clear: () => Promise<void>
  isScanning?: boolean
}

function mapScannerErrorMessage(error: unknown) {
  const fallback = "Scanner konnte nicht gestartet werden"
  if (!(error instanceof Error)) {
    return fallback
  }

  const message = error.message || ""
  if (message.includes("NotAllowedError") || message.toLowerCase().includes("permission")) {
    return "Kamera nicht erlaubt"
  }

  if (
    message.includes("NotFoundError") ||
    message.toLowerCase().includes("camera not found") ||
    message.toLowerCase().includes("no camera")
  ) {
    return "Keine Kamera gefunden"
  }

  return fallback
}

function getQrBoxSize() {
  if (typeof window === "undefined") {
    return 250
  }

  const minSide = Math.min(window.innerWidth, window.innerHeight)
  const dynamicSize = Math.floor(minSide * 0.55)
  return Math.max(200, Math.min(250, dynamicSize))
}

function parseMemberQrToken(rawValue: string) {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return null
  }

  const prefixedMatch = /^TSVBOXGYM:MEMBER:([A-Za-z0-9_-]+)$/i.exec(trimmed)
  if (prefixedMatch?.[1]) {
    return prefixedMatch[1]
  }

  return trimmed
}

function displayMemberName(member: ResolvedMember) {
  const first = member.first_name?.trim() ?? ""
  const last = member.last_name?.trim() ?? ""
  const fullName = `${first} ${last}`.trim()
  return fullName || member.name?.trim() || "Unbekanntes Mitglied"
}

export function ScannerTestClient({
  mode = "test",
  mobileApp = false,
  enableMemberCheckinAction = false,
}: ScannerTestClientProps) {
  const [activeMode, setActiveMode] = useState<ScannerMode>(mode)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scannerError, setScannerError] = useState("")
  const [latestResult, setLatestResult] = useState("")
  const [history, setHistory] = useState<ScanEntry[]>([])
  const [cameraUnsupported, setCameraUnsupported] = useState(false)
  const [statusTone, setStatusTone] = useState<"ready" | "success" | "error">("ready")
  const [statusText, setStatusText] = useState("Scanner gestoppt. Kamera starten, um zu scannen.")
  const [memberLookup, setMemberLookup] = useState<MemberLookupState>({ state: "idle" })
  const [isSubmittingMemberCheckin, setIsSubmittingMemberCheckin] = useState(false)
  const [memberCheckinFeedback, setMemberCheckinFeedback] = useState<{
    status: MemberQrCheckinResponse["status"]
    message: string
    reason?: string
    availableGroups?: Array<{ group: string; time: string }>
  } | null>(null)

  const scannerRef = useRef<Html5QrcodeInstance | null>(null)
  const sequenceRef = useRef(1)
  const lastScanRef = useRef<{ value: string; time: number }>({ value: "", time: 0 })
  const startLockRef = useRef(false)
  const stopLockRef = useRef(false)
  const mountedRef = useRef(true)
  const successResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasPausedByVisibilityRef = useRef(false)
  const lookupRequestRef = useRef(0)
  const lastMemberCheckinRequestRef = useRef<{ token: string; at: number } | null>(null)

  const setStatus = useCallback((tone: "ready" | "success" | "error", text: string) => {
    if (!mountedRef.current) {
      return
    }

    setStatusTone(tone)
    setStatusText(text)
  }, [])

  useEffect(() => {
    mountedRef.current = true

    if (typeof navigator !== "undefined") {
      setCameraUnsupported(!navigator.mediaDevices?.getUserMedia)
    }

    return () => {
      mountedRef.current = false
    }
  }, [])

  const stopScanner = useCallback(async (reason: StopReason = "manual") => {
    if (stopLockRef.current) {
      return
    }

    stopLockRef.current = true
    const scanner = scannerRef.current

    if (mountedRef.current) {
      setIsStopping(true)
    }

    try {
      if (scanner) {
        try {
          await scanner.stop()
        } catch {
          // Ignore stop race conditions.
        }

        try {
          await scanner.clear()
        } catch {
          // Ignore clear race conditions.
        }
      }

      scannerRef.current = null

      if (successResetTimerRef.current) {
        clearTimeout(successResetTimerRef.current)
        successResetTimerRef.current = null
      }

      if (mountedRef.current) {
        setIsScanning(false)
        setIsStopping(false)
        if (reason === "visibility") {
          setStatus("ready", "Scanner pausiert (App im Hintergrund). Kamera bei Rueckkehr neu starten.")
        } else if (reason === "manual") {
          setStatus("ready", "Scanner gestoppt. Kamera starten, um zu scannen.")
        }
      }
    } finally {
      stopLockRef.current = false
    }
  }, [setStatus])

  const addScanToHistory = useCallback((value: string) => {
    const now = Date.now()
    if (lastScanRef.current.value === value && now - lastScanRef.current.time < COOLDOWN_MS) {
      setStatus("ready", `Doppelter Scan erkannt. Warte ${COOLDOWN_MS} ms Cooldown.`)
      return
    }

    lastScanRef.current = { value, time: now }
    setLatestResult(value)
    setStatus("success", "QR-Code erkannt.")

    if (typeof navigator !== "undefined") {
      navigator.vibrate?.(80)
    }

    if (successResetTimerRef.current) {
      clearTimeout(successResetTimerRef.current)
    }

    successResetTimerRef.current = setTimeout(() => {
      if (mountedRef.current && isScanning) {
        setStatus("ready", "Scanner aktiv...")
      }
    }, SUCCESS_STATUS_MS)

    const at = new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Europe/Berlin",
    }).format(new Date(now))

    setHistory((prev) => {
      const entry: ScanEntry = {
        id: sequenceRef.current,
        value,
        at,
      }
      sequenceRef.current += 1
      return [entry, ...prev].slice(0, 10)
    })
  }, [isScanning, setStatus])

  const resolveMemberToken = useCallback(async (rawValue: string) => {
    const parsedToken = parseMemberQrToken(rawValue)
    if (!parsedToken) {
      setMemberLookup({
        state: "error",
        token: rawValue,
        message: "Mitglieder-QR ist ungültig.",
      })
      setStatus("error", "Mitglieder-QR ist ungültig.")
      return
    }

    const requestId = lookupRequestRef.current + 1
    lookupRequestRef.current = requestId
    setMemberLookup({ state: "loading", token: parsedToken })
    setStatus("ready", "Mitglieder-QR wird geprüft...")

    try {
      const response = await fetch("/api/checkin/scan-member-qr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: parsedToken }),
      })

      const payload = (await response.json().catch(() => ({}))) as ScanMemberQrResponse
      if (lookupRequestRef.current !== requestId || !mountedRef.current) {
        return
      }

      if (response.ok && payload.member) {
        setMemberLookup({
          state: "success",
          token: parsedToken,
          member: payload.member,
        })
        setStatus("success", "Mitglied erkannt.")
        return
      }

      const fallbackMessage =
        response.status === 404
          ? "QR-Code nicht gefunden oder deaktiviert. Bitte prüfen."
          : response.status === 503
            ? "QR-Code-Funktion ist noch nicht vollständig aktiviert."
            : response.status === 400
              ? "Mitglieder-QR ist ungültig."
              : "Mitglieder-QR konnte nicht verarbeitet werden."

      const nextState: MemberLookupState =
        response.status === 404 || response.status === 503
          ? { state: "warning", token: parsedToken, message: fallbackMessage }
          : { state: "error", token: parsedToken, message: fallbackMessage }

      setMemberLookup(nextState)
      setStatus(nextState.state === "warning" ? "ready" : "error", fallbackMessage)
    } catch {
      if (lookupRequestRef.current !== requestId || !mountedRef.current) {
        return
      }

      setMemberLookup({
        state: "error",
        token: parsedToken,
        message: "Mitglieder-QR konnte nicht verarbeitet werden.",
      })
      setStatus("error", "Mitglieder-QR konnte nicht verarbeitet werden.")
    }
  }, [setStatus])

  const handleDecodedValue = useCallback((decodedText: string) => {
    addScanToHistory(decodedText)

    if (activeMode === "member") {
      void resolveMemberToken(decodedText)
    }
  }, [activeMode, addScanToHistory, resolveMemberToken])

  const startScanner = useCallback(async () => {
    if (startLockRef.current || isStarting || isScanning || cameraUnsupported || scannerRef.current) {
      return
    }

    startLockRef.current = true
    setScannerError("")
    setIsStarting(true)
    setStatus("ready", "Scanner wird gestartet...")

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode")
      const scanner = new Html5Qrcode(READER_ID) as unknown as Html5QrcodeInstance
      scannerRef.current = scanner

      const scannerConfiguration = {
        fps: SCANNER_FPS,
        qrbox: {
          width: getQrBoxSize(),
          height: getQrBoxSize(),
        },
        aspectRatio: 1.777,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      }

      let started = false
      let initialStartError: unknown = null

      try {
        await scanner.start(
          { facingMode: "environment" },
          scannerConfiguration,
          (decodedText: string) => {
            handleDecodedValue(decodedText)
          },
        )
        started = true
      } catch (error) {
        initialStartError = error
      }

      if (!started) {
        const getCameras = (Html5Qrcode as { getCameras?: () => Promise<Array<{ id: string }>> }).getCameras
        const cameras = typeof getCameras === "function" ? await getCameras() : []
        const fallbackCameraId = cameras[0]?.id
        if (!fallbackCameraId) {
          throw initialStartError ?? new Error("No camera")
        }

        await scanner.start(
          fallbackCameraId,
          scannerConfiguration,
          (decodedText: string) => {
            handleDecodedValue(decodedText)
          },
        )
      }

      setIsScanning(true)
      setStatus("ready", "Scanner aktiv...")
    } catch (error) {
      const message = mapScannerErrorMessage(error)
      await stopScanner("error")
      setScannerError(message)
      setStatus("error", message)
    } finally {
      if (mountedRef.current) {
        setIsStarting(false)
      }
      startLockRef.current = false
    }
  }, [cameraUnsupported, handleDecodedValue, isScanning, isStarting, setStatus, stopScanner])

  useEffect(() => {
    setMemberLookup({ state: "idle" })
    setMemberCheckinFeedback(null)
  }, [activeMode])

  const resetForNextScan = useCallback(() => {
    setMemberLookup({ state: "idle" })
    setMemberCheckinFeedback(null)
    setLatestResult("")
    setStatus("ready", isScanning ? "Scanner aktiv..." : "Scanner gestoppt. Kamera starten, um zu scannen.")
  }, [isScanning, setStatus])

  const triggerMemberCheckin = useCallback(async () => {
    if (memberLookup.state !== "success" || !memberLookup.member.id || isSubmittingMemberCheckin) {
      return
    }

    const now = Date.now()
    const token = memberLookup.token
    const previousRequest = lastMemberCheckinRequestRef.current

    if (previousRequest && previousRequest.token === token && now - previousRequest.at < CHECKIN_ACTION_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((CHECKIN_ACTION_COOLDOWN_MS - (now - previousRequest.at)) / 1000)
      const message = `Doppel-Scan-Schutz aktiv. Bitte ${waitSeconds}s warten oder Nächster Scan wählen.`
      setMemberCheckinFeedback({
        status: "blocked",
        message,
        reason: "duplicate_action_guard",
      })
      setStatus("error", message)
      return
    }

    setIsSubmittingMemberCheckin(true)
    setMemberCheckinFeedback(null)
    setStatus("ready", "Check-in wird vorbereitet...")

    try {
      const response = await fetch("/api/admin/checkin/member-qr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberId: memberLookup.member.id,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as Partial<MemberQrCheckinResponse>
      const nextStatus = payload.status ?? "error"
      const nextMessage = payload.message ?? "Check-in konnte nicht abgeschlossen werden."

      setMemberCheckinFeedback({
        status: nextStatus,
        message: nextMessage,
        reason: payload.reason,
        availableGroups: payload.availableGroups,
      })

      if (nextStatus === "success") {
        lastMemberCheckinRequestRef.current = { token, at: now }
        setStatus("success", nextMessage)
      } else if (nextStatus === "needs_selection") {
        setStatus("ready", nextMessage)
      } else {
        setStatus("error", nextMessage)
      }
    } catch {
      const message = "Check-in konnte nicht abgeschlossen werden."
      setMemberCheckinFeedback({
        status: "error",
        message,
        reason: "network_error",
      })
      setStatus("error", message)
    } finally {
      setIsSubmittingMemberCheckin(false)
    }
  }, [isSubmittingMemberCheckin, memberLookup, setStatus])

  useEffect(() => {
    if (!ENABLE_SCANNER_TEST_HOOK || typeof window === "undefined") {
      return
    }

    function handleScannerTestDecode(event: Event) {
      const customEvent = event as CustomEvent<{ value?: unknown }>
      const rawValue = typeof customEvent.detail?.value === "string" ? customEvent.detail.value.trim() : ""
      if (!rawValue) {
        return
      }

      handleDecodedValue(rawValue)
    }

    window.addEventListener(SCANNER_TEST_EVENT, handleScannerTestDecode as EventListener)
    return () => {
      window.removeEventListener(SCANNER_TEST_EVENT, handleScannerTestDecode as EventListener)
    }
  }, [handleDecodedValue])

  useEffect(() => {
    if (typeof document === "undefined") {
      return
    }

    function handleVisibilityChange() {
      if (document.hidden && isScanning) {
        wasPausedByVisibilityRef.current = true
        void stopScanner("visibility")
        return
      }

      if (!document.hidden && wasPausedByVisibilityRef.current) {
        wasPausedByVisibilityRef.current = false
        setStatus("ready", "Scanner pausiert. Kamera kann erneut gestartet werden.")
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isScanning, setStatus, stopScanner])

  useEffect(() => {
    return () => {
      if (successResetTimerRef.current) {
        clearTimeout(successResetTimerRef.current)
        successResetTimerRef.current = null
      }
      void stopScanner("manual")
    }
  }, [stopScanner])

  const statusStyle =
    statusTone === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : statusTone === "error"
        ? "border-red-300 bg-red-50 text-red-900"
        : "border-amber-300 bg-amber-50 text-amber-900"

  const statusLabel =
    statusTone === "success"
      ? "Erfolgreich"
      : statusTone === "error"
        ? "Ungültig / Fehler"
        : isStarting || isScanning
          ? "Scan läuft"
          : "Bereit"

  const readerMinHeightClass = mobileApp ? "min-h-[56svh]" : "min-h-[260px]"
  const primaryButtonClass = mobileApp
    ? "h-14 rounded-2xl bg-emerald-600 px-6 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
    : "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
  const secondaryButtonClass = mobileApp
    ? "h-14 rounded-2xl bg-zinc-700 px-6 text-base font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
    : "rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"

  return (
    <section className={mobileApp ? "rounded-3xl border border-zinc-300 bg-zinc-950 p-4 shadow-xl text-zinc-100" : "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={mobileApp ? "text-2xl font-bold text-white" : "text-lg font-semibold text-zinc-900"}>
            {mobileApp ? "QR-Scanner" : activeMode === "member" ? "Kamera-Scanner (Mitglieder-QR prüfen)" : "Kamera-Scanner (Testmodus)"}
          </h2>
          <p className={mobileApp ? "mt-1 text-sm text-zinc-300" : "mt-1 text-sm text-zinc-600"}>
            {mobileApp
              ? "QR-Code scannen und Ergebnis prüfen"
              : "Scannt QR-Codes nur lokal im Browser. Es werden keine Daten gespeichert oder weitergeleitet."}
          </p>
          {!mobileApp && (
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Aktiver Modus: {MODE_LABEL[activeMode]}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void startScanner()
            }}
            disabled={isStarting || isScanning || cameraUnsupported}
            className={primaryButtonClass}
          >
            {isStarting ? "Starte..." : "Kamera starten"}
          </button>
          <button
            type="button"
            onClick={() => {
              void stopScanner()
            }}
            disabled={isStopping || !isScanning}
            className={secondaryButtonClass}
          >
            {isStopping ? "Stoppt..." : "Kamera stoppen"}
          </button>
        </div>
      </div>

      {cameraUnsupported && (
        <div className={mobileApp ? "mt-4 rounded-xl border border-amber-400 bg-amber-100 px-3 py-2 text-sm text-amber-900" : "mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"}>
          Dieser Browser unterstützt keinen Kamera-Zugriff. Bitte Safari, Chrome oder Edge auf einem
          Smartphone nutzen.
        </div>
      )}

      {!mobileApp && (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Modus</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveMode("test")}
              data-testid="scanner-mode-test"
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeMode === "test"
                  ? "bg-[#154c83] text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
            >
              Testmodus
            </button>
            <button
              type="button"
              onClick={() => setActiveMode("member")}
              data-testid="scanner-mode-member"
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeMode === "member"
                  ? "bg-[#154c83] text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
            >
              Mitglieder-QR prüfen
            </button>
          </div>
          <p className="mt-3 text-sm text-zinc-600">
            Admin-Testphase: Mitglieder-QRs werden nur identifiziert und angezeigt. Es wird kein Check-in ausgelöst.
          </p>
        </div>
      )}

      {mobileApp && (
        <div className="mt-4 rounded-2xl border border-zinc-700 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-200">
          Testmodus: Es werden keine Check-ins ausgelöst und keine neuen Prozesse gestartet.
        </div>
      )}

      <div data-testid="scanner-status-panel" className={`mt-4 rounded-2xl border px-4 py-4 ${mobileApp ? "border-zinc-700 bg-zinc-900 text-white" : statusStyle}`}>
        <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Status</div>
        <div className={mobileApp ? "mt-1 text-2xl font-extrabold" : "mt-1 text-lg font-bold"}>{statusLabel}</div>
        <div className={mobileApp ? "mt-1 text-sm text-zinc-300" : "mt-1 text-lg font-bold"}>{statusText}</div>
      </div>

      {scannerError && (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {scannerError}
        </div>
      )}

      <div className={mobileApp ? "mt-4 grid gap-4" : "mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]"}>
        <div className={mobileApp ? "rounded-2xl border border-zinc-700 bg-black p-2" : "rounded-xl border border-zinc-200 bg-zinc-50 p-3"}>
          <div id={READER_ID} data-testid="scanner-reader" className={`${readerMinHeightClass} overflow-hidden rounded-lg bg-black/90`} />
        </div>

        <div className={mobileApp ? "rounded-2xl border border-zinc-700 bg-zinc-900 p-4" : "rounded-xl border border-zinc-200 bg-zinc-50 p-4"}>
          <div className={mobileApp ? "text-xs font-semibold uppercase tracking-wide text-zinc-400" : "text-xs font-semibold uppercase tracking-wide text-zinc-500"}>Letztes Ergebnis</div>
          <div data-testid="scanner-latest-result" className={mobileApp ? "mt-2 break-all rounded-xl bg-zinc-950 p-3 text-base font-semibold text-zinc-100" : "mt-2 break-all rounded-lg bg-white p-3 text-base font-semibold text-zinc-900"}>
            {latestResult || "Noch kein QR-Code erkannt"}
          </div>

          {activeMode === "member" && (
            <div data-testid="scanner-member-result" className="mt-4">
              <div className={mobileApp ? "text-xs font-semibold uppercase tracking-wide text-zinc-400" : "text-xs font-semibold uppercase tracking-wide text-zinc-500"}>Mitglieds-Prüfung</div>
              <div className={mobileApp ? "mt-2 rounded-xl bg-zinc-950 p-3 text-sm text-zinc-200" : "mt-2 rounded-lg bg-white p-3 text-sm text-zinc-700"}>
                {memberLookup.state === "idle" && "Noch kein Mitglieder-QR geprüft."}
                {memberLookup.state === "loading" && "Mitglieder-QR wird geprüft..."}
                {memberLookup.state === "success" && (
                  <div className="space-y-2">
                    <div className={mobileApp ? "text-base font-semibold text-emerald-300" : "text-base font-semibold text-emerald-800"}>{displayMemberName(memberLookup.member)}</div>
                    <div>
                      <span className={mobileApp ? "font-medium text-zinc-100" : "font-medium text-zinc-900"}>Gruppe:</span>{" "}
                      {memberLookup.member.base_group?.trim() || "Keine Gruppe"}
                    </div>
                    <div>
                      <span className={mobileApp ? "font-medium text-zinc-100" : "font-medium text-zinc-900"}>Freigabe:</span>{" "}
                      {memberLookup.member.is_approved ? "Freigegeben" : "Nicht freigegeben"}
                    </div>
                    <div>
                      <span className={mobileApp ? "font-medium text-zinc-100" : "font-medium text-zinc-900"}>QR-Status:</span> Aktiv
                    </div>
                  </div>
                )}
                {(memberLookup.state === "warning" || memberLookup.state === "error") && (
                  <div className={memberLookup.state === "warning" ? "text-amber-800" : "text-red-700"}>
                    <div className="font-semibold">{memberLookup.message}</div>
                    <div className="mt-1 text-xs">
                      Token: {memberLookup.token}
                    </div>
                  </div>
                )}
              </div>

              {enableMemberCheckinAction && memberLookup.state === "success" && (
                <div className={mobileApp ? "mt-3 space-y-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3" : "mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3"}>
                  <div className={mobileApp ? "text-sm font-semibold text-zinc-100" : "text-sm font-semibold text-zinc-900"}>Mitgliedskarte</div>
                  <div className={mobileApp ? "text-sm text-zinc-300" : "text-sm text-zinc-700"}>Name: {displayMemberName(memberLookup.member)}</div>
                  <div className={mobileApp ? "text-sm text-zinc-300" : "text-sm text-zinc-700"}>Stammgruppe: {memberLookup.member.base_group?.trim() || "Keine Gruppe"}</div>
                  <div className={mobileApp ? "text-sm text-zinc-300" : "text-sm text-zinc-700"}>Status: QR erkannt</div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void triggerMemberCheckin()
                      }}
                      disabled={isSubmittingMemberCheckin}
                      className={mobileApp
                        ? "h-12 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                        : "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"}
                    >
                      {isSubmittingMemberCheckin ? "Check-in läuft..." : "Mitglied einchecken"}
                    </button>

                    <button
                      type="button"
                      onClick={resetForNextScan}
                      className={mobileApp
                        ? "h-12 rounded-xl border border-zinc-600 bg-zinc-900 px-4 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800"
                        : "rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400"}
                    >
                      Nächster Scan
                    </button>
                  </div>

                  {memberCheckinFeedback && (
                    <div
                      className={
                        memberCheckinFeedback.status === "success"
                          ? "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                          : memberCheckinFeedback.status === "needs_selection"
                            ? "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                            : memberCheckinFeedback.status === "needs_weight"
                              ? "rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
                              : "rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
                      }
                    >
                      <div className="font-semibold">{memberCheckinFeedback.message}</div>
                      {memberCheckinFeedback.status === "needs_selection" && (
                        <div className="mt-1 text-xs">Auswahl erforderlich - noch nicht aktiv.</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!mobileApp && (
            <>
              <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Lokale Historie</div>
              <ul className="mt-2 space-y-2">
                {history.length === 0 ? (
                  <li className="rounded-lg bg-white p-2 text-sm text-zinc-600">Noch keine Scans.</li>
                ) : (
                  history.map((entry) => (
                    <li key={entry.id} className="rounded-lg bg-white p-2 text-sm text-zinc-700">
                      <div className="text-xs text-zinc-500">{entry.at}</div>
                      <div className="break-all font-medium text-zinc-900">{entry.value}</div>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
