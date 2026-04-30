"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type Html5QrcodeInstance = {
  start: (
    cameraConfig: { facingMode: "environment" | "user" } | string,
    configuration?: { fps?: number; aspectRatio?: number },
    qrCodeSuccessCallback?: (decodedText: string) => void,
    qrCodeErrorCallback?: (errorMessage: string) => void,
  ) => Promise<unknown>
  stop: () => Promise<void>
  clear: () => Promise<void>
}

const READER_ID = "verwaltung-tools-scanner-reader"
const SCAN_LOCK_MS = 1000
const FEEDBACK_VISIBLE_MS = 1200

type QrClassificationType = "member" | "unknown" | "invalid"

type QrClassification = {
  type: QrClassificationType
  raw: string
  token?: string
}

type MemberValidation = {
  source: "api" | "simulation"
  found: boolean
  name: string | null
  group: string | null
  status: string | null
  roleFlags: {
    isCompetitionMember: boolean
    isPerformanceGroup: boolean
    isTrial: boolean
  }
  isTestData: boolean
}

type FeedbackTone = "success" | "warning" | "error"

function classifyQrContent(text: string): QrClassification {
  const raw = text.trim()

  if (raw.length < 3) {
    return { type: "invalid", raw }
  }

  const memberPrefix = /^TSVBOXGYM:MEMBER:([A-Za-z0-9_-]+)$/i.exec(raw)
  if (memberPrefix?.[1]) {
    return { type: "member", raw, token: memberPrefix[1] }
  }

  const lowered = raw.toLowerCase()
  if (lowered.includes("/checkin") || lowered.includes("/mein-bereich/qr-code")) {
    let token: string | undefined

    try {
      const url = new URL(raw)
      token = url.searchParams.get("token") ?? undefined
    } catch {
      token = undefined
    }

    return { type: "member", raw, token }
  }

  return { type: "unknown", raw }
}

function getTestTokenInfo(token: string) {
  const match = /^TEST-(\d{3})$/i.exec(token.trim())
  if (!match?.[1]) {
    return null
  }

  return {
    suffix: match[1],
    number: Number.parseInt(match[1], 10),
  }
}

function shortenToken(token: string) {
  if (token.length <= 16) {
    return token
  }

  return `${token.slice(0, 8)}...${token.slice(-6)}`
}

function mapCameraError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Kamera konnte nicht gestartet werden."
  }

  const message = error.message.toLowerCase()

  if (message.includes("notallowederror") || message.includes("permission") || message.includes("denied")) {
    return "Kamerazugriff wurde nicht erlaubt. Bitte Browser-Berechtigung aktivieren."
  }

  if (message.includes("notfounderror") || message.includes("no camera") || message.includes("camera not found")) {
    return "Keine Kamera auf diesem Gerät gefunden."
  }

  return "Kamera konnte nicht gestartet werden."
}

export default function ToolsScannerPage() {
  const scannerRef = useRef<Html5QrcodeInstance | null>(null)
  const lastRawRef = useRef("")
  const lastValidatedTokenRef = useRef("")
  const scanLockUntilRef = useRef(0)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [lastScan, setLastScan] = useState<{
    classification: QrClassification
    at: string
  } | null>(null)
  const [validationLoading, setValidationLoading] = useState(false)
  const [validationError, setValidationError] = useState("")
  const [validationResult, setValidationResult] = useState<MemberValidation | null>(null)
  const [errorText, setErrorText] = useState("")
  const [lastStatusText, setLastStatusText] = useState("Bereit")
  const [feedback, setFeedback] = useState<{
    tone: FeedbackTone
    message: string
  } | null>(null)

  const playBeep = useCallback((tone: FeedbackTone) => {
    if (typeof window === "undefined") {
      return
    }

    const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) {
      return
    }

    const audioContext = audioContextRef.current ?? new AudioCtor()
    audioContextRef.current = audioContext

    if (audioContext.state === "suspended") {
      void audioContext.resume()
    }

    const now = audioContext.currentTime
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.type = tone === "success" ? "triangle" : tone === "warning" ? "sine" : "square"
    oscillator.frequency.setValueAtTime(tone === "success" ? 880 : tone === "warning" ? 620 : 320, now)
    gainNode.gain.setValueAtTime(0.0001, now)
    gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.17)
  }, [])

  const showFeedback = useCallback((tone: FeedbackTone, message: string) => {
    setFeedback({ tone, message })
    setLastStatusText(message)

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(100)
    }

    playBeep(tone)

    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current)
    }

    feedbackTimerRef.current = setTimeout(() => {
      setFeedback(null)
    }, FEEDBACK_VISIBLE_MS)
  }, [playBeep])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    if (!scanner) {
      setIsScanning(false)
      return
    }

    try {
      await scanner.stop()
    } catch {
      // Stop can fail on race conditions; clear is attempted regardless.
    }

    try {
      await scanner.clear()
    } catch {
      // Ignore cleanup errors while tearing down scanner.
    }

    scannerRef.current = null
    setIsScanning(false)
    setLastStatusText("Kamera aus")
  }, [])

  const startScanner = useCallback(async () => {
    if (isStarting || isScanning) {
      return
    }

    setIsStarting(true)
    setErrorText("")
    setLastStatusText("Kamera startet...")

    try {
      const { Html5Qrcode } = await import("html5-qrcode")
      const scanner = new Html5Qrcode(READER_ID) as unknown as Html5QrcodeInstance
      scannerRef.current = scanner

      let started = false
      let firstError: unknown = null

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, aspectRatio: 16 / 9 },
          (decodedText: string) => {
            if (Date.now() < scanLockUntilRef.current) {
              return
            }

            const normalized = decodedText.trim()
            if (!normalized || normalized === lastRawRef.current) {
              return
            }

            lastRawRef.current = normalized
            lastValidatedTokenRef.current = ""
            const classification = classifyQrContent(normalized)
            scanLockUntilRef.current = Date.now() + SCAN_LOCK_MS

            const tone: FeedbackTone =
              classification.type === "member" ? "success" : classification.type === "unknown" ? "warning" : "error"
            const message =
              classification.type === "member"
                ? "MITGLIED ERKANNT"
                : classification.type === "unknown"
                  ? "UNBEKANNT"
                  : "UNGUELTIG"
            showFeedback(tone, message)

            const at = new Intl.DateTimeFormat("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
              timeZone: "Europe/Berlin",
            }).format(new Date())
            setLastScan({ classification, at })
            setValidationError("")
            setValidationResult(null)
          },
          () => {
            // No-op to avoid noisy "no QR" status updates.
          },
        )
        started = true
      } catch (error) {
        firstError = error
      }

      if (!started) {
        const getCameras = (Html5Qrcode as { getCameras?: () => Promise<Array<{ id: string; label: string }>> }).getCameras
        const cameras = typeof getCameras === "function" ? await getCameras() : []
        const preferred = cameras.find((camera) => /back|rear|environment/i.test(camera.label))
        const fallbackCamera = preferred ?? cameras[0]

        if (!fallbackCamera) {
          throw firstError ?? new Error("No camera")
        }

        await scanner.start(
          fallbackCamera.id,
          { fps: 10, aspectRatio: 16 / 9 },
          (decodedText: string) => {
            if (Date.now() < scanLockUntilRef.current) {
              return
            }

            const normalized = decodedText.trim()
            if (!normalized || normalized === lastRawRef.current) {
              return
            }

            lastRawRef.current = normalized
            lastValidatedTokenRef.current = ""
            const classification = classifyQrContent(normalized)
            scanLockUntilRef.current = Date.now() + SCAN_LOCK_MS

            const tone: FeedbackTone =
              classification.type === "member" ? "success" : classification.type === "unknown" ? "warning" : "error"
            const message =
              classification.type === "member"
                ? "MITGLIED ERKANNT"
                : classification.type === "unknown"
                  ? "UNBEKANNT"
                  : "UNGUELTIG"
            showFeedback(tone, message)

            const at = new Intl.DateTimeFormat("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
              timeZone: "Europe/Berlin",
            }).format(new Date())
            setLastScan({ classification, at })
            setValidationError("")
            setValidationResult(null)
          },
          () => {
            // No-op to avoid noisy "no QR" status updates.
          },
        )
      }

      setIsScanning(true)
      setLastStatusText("Kamera aktiv")
    } catch (error) {
      await stopScanner()
      setErrorText(mapCameraError(error))
      setLastStatusText("Kamerafehler")
    } finally {
      setIsStarting(false)
    }
  }, [isScanning, isStarting, showFeedback, stopScanner])

  useEffect(() => {
    return () => {
      void stopScanner()
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current)
        feedbackTimerRef.current = null
      }
    }
  }, [stopScanner])

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior

    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.overscrollBehavior = previousOverscroll
    }
  }, [])

  useEffect(() => {
    if (!lastScan || lastScan.classification.type !== "member" || !lastScan.classification.token) {
      setValidationLoading(false)
      setValidationError("")
      setValidationResult(null)
      return
    }

    const token = lastScan.classification.token.trim()
    if (!token || token === lastValidatedTokenRef.current) {
      return
    }

    const testInfo = getTestTokenInfo(token)
    if (testInfo) {
      lastValidatedTokenRef.current = token
      setValidationLoading(false)
      setValidationError("")
      setValidationResult({
        source: "simulation",
        found: true,
        name: `Test Mitglied ${testInfo.suffix}`,
        group: "Testgruppe",
        status: "TESTDATEN",
        roleFlags: {
          isCompetitionMember: false,
          isPerformanceGroup: false,
          isTrial: true,
        },
        isTestData: true,
      })
      return
    }

    const abortController = new AbortController()
    setValidationLoading(true)
    setValidationError("")
    setValidationResult(null)

    void (async () => {
      try {
        const response = await fetch("/api/admin/scan-member-qr", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: abortController.signal,
        })

        const payload = (await response.json().catch(() => ({}))) as {
          found?: boolean
          name?: string | null
          group?: string | null
          status?: string | null
          roleFlags?: {
            isCompetitionMember?: boolean
            isPerformanceGroup?: boolean
            isTrial?: boolean
          }
        }

        if (!response.ok) {
          throw new Error("validierung_fehlgeschlagen")
        }

        lastValidatedTokenRef.current = token
        setValidationResult({
          source: "api",
          found: Boolean(payload.found),
          name: payload.name ?? null,
          group: payload.group ?? null,
          status: payload.status ?? null,
          roleFlags: {
            isCompetitionMember: Boolean(payload.roleFlags?.isCompetitionMember),
            isPerformanceGroup: Boolean(payload.roleFlags?.isPerformanceGroup),
            isTrial: Boolean(payload.roleFlags?.isTrial),
          },
          isTestData: false,
        })
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
        setValidationError("Validierung konnte nicht geladen werden.")
      } finally {
        setValidationLoading(false)
      }
    })()

    return () => {
      abortController.abort()
    }
  }, [lastScan])

  return (
    <div className="fixed inset-0 z-[80] h-[100svh] w-screen overflow-hidden bg-black text-white">
      <div id={READER_ID} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-0 h-[22%] w-full bg-black/45" />
        <div className="absolute bottom-0 left-0 h-[28%] w-full bg-black/45" />
        <div className="absolute left-0 top-[22%] h-[50%] w-[13%] bg-black/45" />
        <div className="absolute right-0 top-[22%] h-[50%] w-[13%] bg-black/45" />

        <div className="absolute left-1/2 top-[47%] h-[38svh] w-[74vw] max-w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border-4 border-white/80 shadow-[0_0_0_2px_rgba(255,255,255,0.2),0_0_40px_rgba(0,0,0,0.5)]">
          <div className="absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-white/90" />
        </div>
      </div>

      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] text-xs">
        <div className="rounded-full bg-black/55 px-3 py-1 font-semibold">
          Kamera: {isScanning ? "aktiv" : "aus"}
        </div>
        <div className="rounded-full bg-black/55 px-3 py-1">Status: {lastStatusText}</div>
      </div>

      {feedback && (
        <div className={`absolute inset-0 z-20 flex items-center justify-center px-6 text-center ${
          feedback.tone === "success"
            ? "bg-emerald-500/25"
            : feedback.tone === "warning"
              ? "bg-amber-500/28"
              : "bg-red-600/28"
        }`}>
          <div className={`rounded-2xl border px-5 py-4 text-2xl font-black tracking-wide sm:text-3xl ${
            feedback.tone === "success"
              ? "border-emerald-200 bg-emerald-100/90 text-emerald-900"
              : feedback.tone === "warning"
                ? "border-amber-200 bg-amber-100/90 text-amber-900"
                : "border-red-200 bg-red-100/90 text-red-900"
          }`}>
            {feedback.message}
          </div>
        </div>
      )}

      {errorText && (
        <div className="absolute left-4 right-4 top-16 z-20 rounded-xl border border-red-300 bg-red-100/95 px-3 py-2 text-sm font-semibold text-red-800">
          {errorText}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(env(safe-area-inset-bottom),14px)]">
        <div className="rounded-2xl border border-white/20 bg-black/70 p-3 backdrop-blur">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                void startScanner()
              }}
              disabled={isStarting || isScanning}
              className="h-12 rounded-xl bg-emerald-600 px-4 text-base font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-900/60"
            >
              {isStarting ? "Starte..." : "Start"}
            </button>

            <button
              type="button"
              onClick={() => {
                void stopScanner()
              }}
              disabled={!isScanning}
              className="h-12 rounded-xl bg-zinc-700 px-4 text-base font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-900/60"
            >
              Stop
            </button>
          </div>

          {lastScan && (
            <div className="space-y-1 text-xs text-zinc-200">
              <div>
                Typ: {lastScan.classification.type === "member" ? "Mitglied" : lastScan.classification.type === "unknown" ? "Unbekannt" : "Ungueltig"}
              </div>
              {lastScan.classification.token && <div>Token: {shortenToken(lastScan.classification.token)}</div>}
              {validationLoading && <div>Pruefung laeuft...</div>}
              {validationError && <div className="text-red-300">{validationError}</div>}
              {validationResult && (
                <div>
                  Quelle: {validationResult.source === "simulation" ? "Lokale Simulation" : "Read-only API"}
                  {" · "}Status: {validationResult.status || (validationResult.found ? "Unbekannt" : "Nicht vorhanden")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        #${READER_ID} {
          position: absolute;
          inset: 0;
          height: 100svh;
          width: 100vw;
          overflow: hidden;
          background: #000;
        }

        #${READER_ID} > div {
          height: 100%;
          width: 100%;
        }

        #${READER_ID} video {
          height: 100% !important;
          width: 100% !important;
          object-fit: cover;
        }
      `}</style>
    </div>
  )
}
