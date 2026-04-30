"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type Html5QrcodeInstance = {
  start: (
    cameraConfig: { facingMode: "environment" | "user" } | string,
    configuration?: {
      fps?: number
      aspectRatio?: number
      disableFlip?: boolean
      qrbox?:
        | { width: number; height: number }
        | ((viewfinderWidth: number, viewfinderHeight: number) => { width: number; height: number })
    },
    qrCodeSuccessCallback?: (decodedText: string) => void,
    qrCodeErrorCallback?: (errorMessage: string) => void,
  ) => Promise<unknown>
  stop: () => Promise<void>
  clear: () => Promise<void>
}

const READER_ID = "trainer-qr-scanner-v1-reader"
const CAMERA_FPS = 14
const SCAN_LOCK_MS = 400
const SCAN_DEDUPE_MS = 800
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

type UiScanType = "Mitglied" | "Unbekannt" | "Ungueltig"

type TrainerQrScannerV1Props = {
  autoStart?: boolean
}

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
    return "Kamerazugriff erforderlich"
  }

  if (message.includes("notfounderror") || message.includes("no camera") || message.includes("camera not found")) {
    return "Keine Kamera auf diesem Geraet gefunden."
  }

  return "Kamera konnte nicht gestartet werden."
}

function getUiScanType(classification: QrClassification): UiScanType {
  if (classification.type === "member") {
    return "Mitglied"
  }

  if (classification.type === "unknown") {
    return "Unbekannt"
  }

  return "Ungueltig"
}

function isCameraAccessRequired(errorText: string) {
  return errorText.toLowerCase().includes("kamerazugriff erforderlich")
}

// Frozen trainer scanner baseline. Admin scanner evolves independently from here.
export default function TrainerQrScannerV1({ autoStart = true }: TrainerQrScannerV1Props) {
  const scannerRef = useRef<Html5QrcodeInstance | null>(null)
  const lastRawRef = useRef("")
  const lastRawAtRef = useRef(0)
  const lastValidatedTokenRef = useRef("")
  const scanLockUntilRef = useRef(0)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const autoStartAttemptedRef = useRef(false)

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
      if (tone === "success") {
        navigator.vibrate([80, 40, 80])
      } else if (tone === "warning") {
        navigator.vibrate([120])
      } else {
        navigator.vibrate([60, 40, 60, 40, 120])
      }
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
    lastRawRef.current = ""
    lastRawAtRef.current = 0
    setIsScanning(false)
    setLastStatusText("Kamera aus")
  }, [])

  const handleDecoded = useCallback((decodedText: string) => {
    const now = Date.now()
    if (now < scanLockUntilRef.current) {
      return
    }

    const normalized = decodedText.trim()
    if (!normalized) {
      return
    }

    if (normalized === lastRawRef.current && now - lastRawAtRef.current < SCAN_DEDUPE_MS) {
      return
    }

    lastRawRef.current = normalized
    lastRawAtRef.current = now
    lastValidatedTokenRef.current = ""
    const classification = classifyQrContent(normalized)
    scanLockUntilRef.current = now + SCAN_LOCK_MS

    const tone: FeedbackTone =
      classification.type === "member" ? "success" : classification.type === "unknown" ? "warning" : "error"
    const message =
      classification.type === "member"
        ? (getTestTokenInfo(classification.token ?? "") ? "TEST-QR ERKANNT" : "MITGLIED ERKANNT")
        : classification.type === "unknown"
          ? "UNBEKANNTER QR-CODE"
          : "UNGUELTIGER QR-CODE"

    // Immediate haptic/audio feedback before any async API validation.
    showFeedback(tone, message)

    const at = new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Europe/Berlin",
    }).format(new Date())

    setLastScan({ classification, at })
    setValidationLoading(classification.type === "member")
    setValidationError("")
    setValidationResult(null)
  }, [showFeedback])

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

      const scannerConfig = {
        fps: CAMERA_FPS,
        aspectRatio: 1,
        disableFlip: true,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const edge = Math.max(220, Math.min(360, Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72)))
          return { width: edge, height: edge }
        },
      }

      try {
        await scanner.start(
          { facingMode: "environment" },
          scannerConfig,
          handleDecoded,
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
          scannerConfig,
          handleDecoded,
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
  }, [handleDecoded, isScanning, isStarting, stopScanner])

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
        const response = await fetch("/api/trainer/scan-member-qr", {
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

  useEffect(() => {
    if (!autoStart || autoStartAttemptedRef.current) {
      return
    }

    autoStartAttemptedRef.current = true
    void startScanner()
  }, [autoStart, startScanner])

  const latestScanType = lastScan ? getUiScanType(lastScan.classification) : "-"
  const memberName = validationResult?.name || "-"
  const memberGroup = validationResult?.group || "-"
  const memberStatus = validationResult
    ? validationResult.status || (validationResult.found ? "Unbekannt" : "Nicht vorhanden")
    : "-"
  const memberSource = validationResult
    ? validationResult.source === "simulation"
      ? "Test (Lokale Simulation)"
      : "Read-only API"
    : "-"
  const needsCameraPermission = isCameraAccessRequired(errorText)

  return (
    <div className="fixed inset-0 z-[80] h-[100svh] w-screen overflow-hidden bg-gradient-to-b from-[#10243d] via-[#16385a] to-[#0d1723] text-white">
      <div className="mx-auto flex h-full w-full max-w-[860px] flex-col px-3 pb-3 pt-[max(env(safe-area-inset-top),10px)] sm:px-4">
        <div className="mb-2 flex items-center justify-between px-1 text-xs">
          <div className="rounded-full border border-sky-200/20 bg-slate-900/70 px-3 py-1.5 font-semibold text-slate-100">
            Kamera: {isScanning ? "aktiv" : "aus"}
          </div>
          <div className="rounded-full border border-sky-200/20 bg-slate-900/70 px-3 py-1.5 text-slate-200">
            Status: {lastStatusText}
          </div>
        </div>

        <section className="rounded-2xl border border-sky-100/10 bg-slate-900/60 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-black tracking-tight text-white">QR Scanner - Testfunktion</h1>
              <p className="mt-1 text-sm text-slate-300">Pruefung nur lesend - kein Check-in</p>
            </div>
            <div className="rounded-full border border-sky-200/20 bg-slate-950/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-100">
              Version 1.0
            </div>
          </div>
        </section>

        <section className="relative w-full overflow-hidden rounded-3xl border border-sky-100/15 bg-slate-950 shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
          <div className="relative aspect-square min-h-[280px] max-h-[420px] w-full max-w-[420px] overflow-hidden sm:min-h-[320px]">
            <div id={READER_ID} className="h-full w-full" />

            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-0 top-0 h-[13%] w-full bg-black/40" />
              <div className="absolute bottom-0 left-0 h-[13%] w-full bg-black/40" />
              <div className="absolute left-0 top-[13%] h-[74%] w-[13%] bg-black/40" />
              <div className="absolute right-0 top-[13%] h-[74%] w-[13%] bg-black/40" />

              <div className="absolute left-1/2 top-1/2 aspect-square h-[72%] max-h-[300px] w-[72%] max-w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] border-[3px] border-sky-100/90 shadow-[0_0_0_1px_rgba(255,255,255,0.3),0_0_32px_rgba(5,20,34,0.8)]">
                <div className="absolute inset-x-6 top-1/2 h-[2px] -translate-y-1/2 animate-pulse bg-sky-100/80" />
              </div>
            </div>

            {feedback && (
              <div className="absolute left-3 right-3 top-3 z-20">
                <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur ${
                  feedback.tone === "success"
                    ? "border-emerald-300/60 bg-emerald-500/20 text-emerald-50"
                    : feedback.tone === "warning"
                      ? "border-amber-300/60 bg-amber-500/20 text-amber-50"
                      : "border-rose-300/60 bg-rose-500/20 text-rose-50"
                }`}>
                  {feedback.message}
                </div>
              </div>
            )}

            {errorText && (
              <div className="absolute left-3 right-3 top-16 z-20 rounded-xl border border-red-300/70 bg-red-700/30 px-3 py-2 text-sm font-semibold text-red-100">
                {errorText}
              </div>
            )}

            {autoStart && needsCameraPermission && (
              <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-amber-300/70 bg-amber-800/50 px-3 py-3">
                <div className="text-sm font-semibold text-amber-100">Kamerazugriff erforderlich</div>
                <button
                  type="button"
                  onClick={() => {
                    void startScanner()
                  }}
                  className="mt-2 h-10 rounded-lg bg-amber-400 px-4 text-sm font-bold text-amber-950 transition hover:bg-amber-300"
                >
                  Erneut versuchen
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-sky-100/10 bg-slate-900/75 p-3">
            <button
              type="button"
              onClick={() => {
                void startScanner()
              }}
              disabled={isStarting || isScanning}
              className="h-12 rounded-xl bg-[#0f5f9b] px-4 text-base font-bold text-white transition hover:bg-[#0c4f82] disabled:cursor-not-allowed disabled:bg-[#365f7b]"
            >
              {isStarting ? "Starte..." : "Start"}
            </button>

            <button
              type="button"
              onClick={() => {
                void stopScanner()
              }}
              disabled={!isScanning}
              className="h-12 rounded-xl bg-slate-700 px-4 text-base font-bold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-800"
            >
              Stop
            </button>
          </div>
        </section>

        <section className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-sky-100/10 bg-slate-900/60 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-sky-100/90">Scanner-Informationen</h2>
          <p className="mt-1 text-xs text-slate-300">Pruefung nur lesend - kein Check-in, keine Datenbank-Schreiboperation.</p>

          <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-sky-200/20 bg-gradient-to-r from-sky-950/60 to-slate-950/70 px-3 py-3 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-sky-200/80">Erkannter Nutzer</div>
              <div className="mt-1 text-xl font-black tracking-tight text-white">{memberName}</div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Scanstatus</div>
              <div className="mt-1 font-semibold text-slate-100">{lastStatusText}</div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Letzter Scan</div>
              <div className="mt-1 font-semibold text-slate-100">{lastScan?.at || "-"}</div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">QR-Typ</div>
              <div className="mt-1 font-semibold text-slate-100">{latestScanType}</div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Quelle</div>
              <div className="mt-1 font-semibold text-slate-100">{memberSource}</div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Rohwert</div>
              <div className="mt-1 break-all text-slate-100">{lastScan?.classification.raw || "-"}</div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Token</div>
              <div className="mt-1 break-all text-slate-100">{lastScan?.classification.token ? shortenToken(lastScan.classification.token) : "-"}</div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Gruppe</div>
              <div className="mt-1 font-semibold text-slate-100">{memberGroup}</div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Status</div>
              <div className="mt-1 font-semibold text-slate-100">{validationLoading ? "Pruefung laeuft..." : memberStatus}</div>
              {validationError && <div className="mt-1 text-xs text-red-300">{validationError}</div>}
            </div>
          </div>
        </section>
      </div>

      <style jsx global>{`
        #${READER_ID} {
          position: absolute;
          inset: 0;
          height: 100%;
          width: 100%;
          overflow: hidden;
          background: #02060b;
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
