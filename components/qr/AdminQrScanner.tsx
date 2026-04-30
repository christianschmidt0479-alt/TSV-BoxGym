"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type Html5QrcodeInstance = {
  start: (
    cameraConfig: { facingMode: "environment" | "user" | { exact: "environment" | "user" } } | string,
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

const READER_ID = "verwaltung-tools-scanner-reader"
const CAMERA_FPS = 14
const CAMERA_ASPECT_RATIO = 1
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

type AdminQrScannerProps = {
  autoStart: boolean
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
    return "Keine Kamera auf diesem Gerät gefunden."
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

function isIPhoneLikeDevice() {
  if (typeof navigator === "undefined") {
    return false
  }

  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function getScannerConfig() {
  return {
    fps: CAMERA_FPS,
    aspectRatio: CAMERA_ASPECT_RATIO,
    disableFlip: true,
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
      const edge = Math.max(220, Math.min(360, Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72)))
      return { width: edge, height: edge }
    },
  }
}

export default function AdminQrScanner({ autoStart }: AdminQrScannerProps) {
  const scannerRef = useRef<Html5QrcodeInstance | null>(null)
  const titleSectionRef = useRef<HTMLElement | null>(null)
  const buttonBarRef = useRef<HTMLDivElement | null>(null)
  const lastRawRef = useRef("")
  const lastRawAtRef = useRef(0)
  const lastValidatedTokenRef = useRef("")
  const scanLockUntilRef = useRef(0)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const autoStartAttemptedRef = useRef(false)
  const activeCameraIdRef = useRef<string | null>(null)

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
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([])
  const [activeCameraLabel, setActiveCameraLabel] = useState("-")
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [scannerSizePx, setScannerSizePx] = useState(240)
  const [infoMaxHeightPx, setInfoMaxHeightPx] = useState<number | null>(null)
  const [devScannerInfo, setDevScannerInfo] = useState<{
    isIPhoneLike: boolean
    fps: number
    aspectRatio: string
    qrbox: string
    lastDecodeAt: string
    cameras: string[]
    activeCamera: string
  }>({
    isIPhoneLike: false,
    fps: CAMERA_FPS,
    aspectRatio: `${CAMERA_ASPECT_RATIO.toFixed(2)}`,
    qrbox: "-",
    lastDecodeAt: "-",
    cameras: [],
    activeCamera: "-",
  })

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
    const normalized = decodedText.trim()
    if (!normalized) {
      return
    }

    const isSameQr = normalized === lastRawRef.current

    if (isSameQr && now < scanLockUntilRef.current) {
      return
    }

    if (isSameQr && now - lastRawAtRef.current < SCAN_DEDUPE_MS) {
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
    if (process.env.NODE_ENV !== "production") {
      setDevScannerInfo((previous) => ({ ...previous, lastDecodeAt: at }))
    }
    setValidationLoading(classification.type === "member")
    setValidationError("")
    setValidationResult(null)
  }, [showFeedback])

  const startScanner = useCallback(async () => {
    if (isStarting) {
      return
    }

    // Stop any existing scanner before starting a new one.
    if (scannerRef.current) {
      await stopScanner()
    }

    setIsStarting(true)
    setErrorText("")
    setLastStatusText("Kamera startet...")

    try {
      const { Html5Qrcode } = await import("html5-qrcode")

      // Clear the container DOM to prevent html5-qrcode double-init errors.
      const container = document.getElementById(READER_ID)
      if (container) {
        container.innerHTML = ""
      }

      const scanner = new Html5Qrcode(READER_ID) as unknown as Html5QrcodeInstance
      scannerRef.current = scanner

      const isIPhoneLike = isIPhoneLikeDevice()
      if (process.env.NODE_ENV !== "production") {
        setDevScannerInfo((previous) => ({
          ...previous,
          isIPhoneLike,
          fps: CAMERA_FPS,
          aspectRatio: `${CAMERA_ASPECT_RATIO.toFixed(2)}`,
        }))
      }

      const scannerConfig = {
        ...getScannerConfig(),
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const edge = Math.max(240, Math.min(380, Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.78)))
          if (process.env.NODE_ENV !== "production") {
            const nextQrBox = `${edge}x${edge}`
            setDevScannerInfo((previous) =>
              previous.qrbox === nextQrBox ? previous : { ...previous, qrbox: nextQrBox }
            )
          }
          return { width: edge, height: edge }
        },
      }

      // Enumerate cameras for DEV panel and label-based fallback selection.
      const getCamerasStatic = (Html5Qrcode as { getCameras?: () => Promise<Array<{ id: string; label: string }>> }).getCameras
      let cameras: Array<{ id: string; label: string }> = []
      if (typeof getCamerasStatic === "function") {
        try {
          cameras = await getCamerasStatic()
          setAvailableCameras(cameras)
          if (process.env.NODE_ENV !== "production") {
            setDevScannerInfo((previous) => ({
              ...previous,
              cameras: cameras.map((c) => c.label || c.id),
            }))
          }
        } catch {
          // Camera enumeration may fail; continue with facingMode fallbacks.
        }
      }

      // Check localStorage for a previously chosen camera.
      const savedCameraId =
        typeof localStorage !== "undefined" ? localStorage.getItem("admin-scanner-camera-id") : null
      const savedCamera = savedCameraId ? cameras.find((c) => c.id === savedCameraId) : null

      let started = false
      let startedLabel = "-"

      // 1. Preferred camera from localStorage (user switched manually before).
      if (!started && savedCamera) {
        try {
          await scanner.start(savedCamera.id, scannerConfig, handleDecoded, () => {})
          started = true
          startedLabel = savedCamera.label || savedCamera.id
          activeCameraIdRef.current = savedCamera.id
        } catch {
          // Saved camera unavailable; try next fallback.
        }
      }

      // 2. Exact facingMode constraint (most reliable on iPhone for true rear camera).
      if (!started) {
        try {
          await scanner.start({ facingMode: { exact: "environment" } }, scannerConfig, handleDecoded, () => {})
          started = true
          startedLabel = "Rückkamera (exact)"
          activeCameraIdRef.current = null      
      // Check torch support.
      try {
        const track = (scanner as any).getRunningTrack?.()
        const caps = track?.getCapabilities?.()
        if (caps?.torch) {
          setTorchSupported(true)
        }
      } catch {
        // Torch check failed; continue.
      }        } catch {
          // exact constraint rejected by browser; fall through.
        }
      }

      // 3. Loose facingMode: "environment" fallback.
      if (!started) {
        try {
          await scanner.start({ facingMode: "environment" }, scannerConfig, handleDecoded, () => {})
          started = true
          startedLabel = "Rückkamera"
          activeCameraIdRef.current = null
        } catch {
          // facingMode "environment" failed; fall through.
        }
      }

      // 4. Back camera by label from getCameras(), then first available.
      if (!started && cameras.length > 0) {
        const backCamera =
          cameras.find((c) => /back|rear|environment/i.test(c.label)) ?? cameras[0]
        try {
          await scanner.start(backCamera.id, scannerConfig, handleDecoded, () => {})
          started = true
          startedLabel = backCamera.label || backCamera.id
          activeCameraIdRef.current = backCamera.id
        } catch {
          // All fallbacks exhausted.
        }
      }

      if (!started) {
        throw new Error("No camera available")
      }

      setActiveCameraLabel(startedLabel)
      if (process.env.NODE_ENV !== "production") {
        setDevScannerInfo((previous) => ({ ...previous, activeCamera: startedLabel }))
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
  }, [handleDecoded, isStarting, stopScanner])

  const switchCamera = useCallback(async () => {
    if (availableCameras.length < 2 || isStarting) {
      return
    }

    const currentId = activeCameraIdRef.current
    const currentIndex = currentId ? availableCameras.findIndex((c) => c.id === currentId) : -1
    const nextIndex = (currentIndex + 1) % availableCameras.length
    const nextCamera = availableCameras[nextIndex]

    // Save preference so startScanner picks it up on restart.
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("admin-scanner-camera-id", nextCamera.id)
    }

    await startScanner()
  }, [availableCameras, isStarting, startScanner])

  const resetScan = useCallback(() => {
    setLastScan(null)
    setValidationResult(null)
    setValidationError("")
    setTorchOn(false)
    lastValidatedTokenRef.current = ""
  }, [])

  const toggleTorch = useCallback(async () => {
    if (!scannerRef.current) return
    try {
      const track = (scannerRef.current as any).getRunningTrack?.()
      if (!track) return
      const caps = track.getCapabilities?.()
      if (!caps?.torch) return
      const settings = track.getSettings?.()
      await track.applyConstraints({
        advanced: [{ torch: !settings?.torch }],
      })
    } catch {
      // Torch not supported or already failed
    }
  }, [])

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

  useEffect(() => {
    if (!autoStart || autoStartAttemptedRef.current || isIPhoneLikeDevice()) {
      return
    }

    autoStartAttemptedRef.current = true
    void startScanner()
  }, [autoStart, startScanner])

  useEffect(() => {
    if (!autoStart || typeof document === "undefined") {
      return
    }

    document.body.classList.add("admin-scanner-fullscreen")
    return () => {
      document.body.classList.remove("admin-scanner-fullscreen")
    }
  }, [autoStart])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

    const recomputeLayout = () => {
      const visibleHeight = Math.max(
        0,
        Math.floor(window.visualViewport?.height ?? window.innerHeight)
      )

      setViewportHeight(visibleHeight)

      const titleHeight = titleSectionRef.current?.offsetHeight ?? 44
      const buttonBarHeight = buttonBarRef.current?.offsetHeight ?? 44

      // Reserve space for safe areas, compact info card, and vertical gaps.
      const reservedForInfo = 220
      const verticalChrome = 70
      const availableScanner = visibleHeight - titleHeight - buttonBarHeight - reservedForInfo - verticalChrome
      const nextScannerSize = clamp(availableScanner, 180, 300)
      setScannerSizePx(nextScannerSize)

      const availableInfo = visibleHeight - titleHeight - buttonBarHeight - nextScannerSize - verticalChrome
      setInfoMaxHeightPx(Math.max(140, Math.floor(availableInfo)))
    }

    let rafId: number | null = null
    const scheduleRecompute = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      rafId = requestAnimationFrame(() => {
        recomputeLayout()
        rafId = null
      })
    }

    scheduleRecompute()
    window.addEventListener("resize", scheduleRecompute)
    window.addEventListener("orientationchange", scheduleRecompute)
    window.visualViewport?.addEventListener("resize", scheduleRecompute)
    window.visualViewport?.addEventListener("scroll", scheduleRecompute)

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      window.removeEventListener("resize", scheduleRecompute)
      window.removeEventListener("orientationchange", scheduleRecompute)
      window.visualViewport?.removeEventListener("resize", scheduleRecompute)
      window.visualViewport?.removeEventListener("scroll", scheduleRecompute)
    }
  }, [])

  const latestScanType = lastScan ? getUiScanType(lastScan.classification) : "-"
  const memberName = validationResult?.name || "-"
  const memberGroup = validationResult?.group || "-"
  const memberStatus = validationResult
    ? validationResult.status || (validationResult.found ? "Unbekannt" : "Nicht vorhanden")
    : "-"
  const memberSource = validationResult
    ? validationResult.source === "simulation"
      ? "Test"
      : "API"
    : "-"
  const rawPreview = lastScan?.classification.raw
    ? lastScan.classification.raw.length > 44
      ? `${lastScan.classification.raw.slice(0, 26)}...${lastScan.classification.raw.slice(-12)}`
      : lastScan.classification.raw
    : "-"
  const needsCameraPermission = isCameraAccessRequired(errorText)
  const computedRootMinHeight = viewportHeight ? `${viewportHeight}px` : "100dvh"

  return (
    <div className="relative z-[80] w-full overflow-hidden bg-gradient-to-b from-[#061421] via-[#0a1f33] to-[#0d1723] text-white" style={{ minHeight: computedRootMinHeight }}>
      <div className="mx-auto flex w-full max-w-[860px] flex-col px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-[max(env(safe-area-inset-top),10px)] sm:px-4" style={{ minHeight: computedRootMinHeight }}>
        <section ref={titleSectionRef} className="rounded-2xl border border-sky-100/10 bg-slate-900/60 px-3 py-2">
          <h1 className="text-base font-black tracking-tight text-white sm:text-lg">QR Scanner</h1>
        </section>

        <section className="relative mt-2 w-full overflow-hidden rounded-3xl border border-sky-100/15 bg-slate-950 shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
          <div className="flex w-full items-start justify-center py-2">
            <div
              className="relative aspect-square overflow-hidden rounded-2xl"
              style={{ width: `${scannerSizePx}px`, height: `${scannerSizePx}px`, maxWidth: "300px", maxHeight: "300px" }}
            >
            <div id={READER_ID} className="h-full w-full" />

            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-0 top-0 h-[13%] w-full bg-black/40" />
              <div className="absolute bottom-0 left-0 h-[13%] w-full bg-black/40" />
              <div className="absolute left-0 top-[13%] h-[74%] w-[13%] bg-black/40" />
              <div className="absolute right-0 top-[13%] h-[74%] w-[13%] bg-black/40" />

              <div className="absolute inset-0 m-auto aspect-square h-[78%] w-[78%] rounded-[24px] border-[3px] border-sky-100/90 shadow-[0_0_0_1px_rgba(255,255,255,0.3),0_0_32px_rgba(5,20,34,0.8)]">
                <div className="absolute inset-x-6 top-1/2 h-[2px] animate-pulse bg-sky-100/80" />
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

            {!isScanning && !isStarting && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/85">
                <button
                  type="button"
                  onClick={() => { void startScanner() }}
                  className="rounded-xl bg-[#0f5f9b] px-6 py-3 text-base font-bold text-white shadow-xl transition hover:bg-[#0c4f82] active:scale-95"
                >
                  Scanner starten
                </button>
              </div>
            )}

            {needsCameraPermission && (
              <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-amber-300/70 bg-amber-800/50 px-3 py-3">
                <div className="text-sm font-semibold text-amber-100">Kamerazugriff erforderlich</div>
                <p className="mt-1 text-xs text-amber-200">Bitte Kamera erlauben und erneut starten.</p>
                <button
                  type="button"
                  onClick={() => {
                    void startScanner()
                  }}
                  className="mt-2 h-10 rounded-lg bg-amber-400 px-4 text-sm font-bold text-amber-950 transition hover:bg-amber-300"
                >
                  Erneut starten
                </button>
              </div>
            )}
            </div>
          </div>

          <div ref={buttonBarRef} className="flex flex-wrap items-center justify-center gap-1.5 border-t border-sky-100/10 bg-slate-900/75 p-1.5">
            <button
              type="button"
              onClick={() => {
                void startScanner()
              }}
              disabled={isStarting || isScanning}
              className="h-9 rounded-lg bg-[#0f5f9b] px-3 text-xs font-bold text-white transition hover:bg-[#0c4f82] disabled:cursor-not-allowed disabled:bg-[#365f7b]"
            >
              {isStarting ? "Starte..." : "Start"}
            </button>

            <button
              type="button"
              onClick={() => {
                void stopScanner()
              }}
              disabled={!isScanning}
              className="h-9 rounded-lg bg-slate-700 px-3 text-xs font-bold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-800"
            >
              Stop
            </button>

            <button
              type="button"
              onClick={resetScan}
              disabled={!lastScan}
              className="h-9 rounded-lg bg-slate-700 px-3 text-xs font-bold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-800"
            >
              Neuer Scan
            </button>

            {torchSupported && (
              <button
                type="button"
                onClick={() => {
                  void toggleTorch().then(() => setTorchOn((prev) => !prev))
                }}
                disabled={!isScanning}
                title="Licht ein/aus"
                className={`h-9 rounded-lg px-2.5 text-xs font-bold transition ${
                  torchOn
                    ? "bg-yellow-500 text-yellow-900 hover:bg-yellow-400"
                    : "bg-slate-600 text-white hover:bg-slate-500"
                } disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400`}
              >
                💡
              </button>
            )}

            {availableCameras.length > 1 && (
              <button
                type="button"
                onClick={() => { void switchCamera() }}
                disabled={!isScanning || isStarting}
                title={`Aktiv: ${activeCameraLabel}`}
                className="h-9 truncate rounded-lg bg-slate-600 px-2.5 text-xs font-bold text-white transition hover:bg-slate-500 disabled:cursor-not-allowed disabled:bg-slate-800"
              >
                Kamera ↔
              </button>
            )}
          </div>
        </section>

        <section className="mt-2 min-h-0 flex-1 overflow-hidden rounded-2xl border border-sky-100/10 bg-slate-900/60 p-2">
          <div className="h-full overflow-y-auto" style={{ maxHeight: infoMaxHeightPx ? `${infoMaxHeightPx}px` : undefined }}>
          <div className="rounded-xl border border-sky-200/20 bg-gradient-to-r from-sky-950/60 to-slate-950/70 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-sky-200/80">Name</div>
            <div className="mt-0.5 text-lg font-black tracking-tight text-white sm:text-xl">{memberName}</div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
            <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Gruppe</div>
              <div className="mt-0.5 font-semibold text-slate-100">{memberGroup}</div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Status</div>
              <div className="mt-0.5 font-semibold text-slate-100">{validationLoading ? "Pruefung laeuft..." : memberStatus}</div>
              {validationError && <div className="mt-0.5 text-[11px] text-red-300">{validationError}</div>}
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">QR-Typ</div>
              <div className="mt-0.5 font-semibold text-slate-100">{latestScanType}</div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Quelle</div>
              <div className="mt-0.5 font-semibold text-slate-100">{memberSource}</div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Zeit</div>
              <div className="mt-0.5 font-semibold text-slate-100">{lastScan?.at || "-"}</div>
            </div>

            <div className="col-span-2 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Token</div>
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-100">{lastScan?.classification.token ? shortenToken(lastScan.classification.token) : "-"}</div>
            </div>

            <div className="col-span-2 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Rohwert</div>
              <div className="mt-0.5 truncate text-xs text-slate-300">{rawPreview}</div>
            </div>
          </div>

          <p className="mt-2 text-center text-[10px] text-slate-400">Nur Anzeige, kein Check-in.</p>
          </div>
        </section>
      </div>

      <style jsx global>{`
        body.admin-scanner-fullscreen [data-app-header],
        body.admin-scanner-fullscreen [data-app-footer],
        body.admin-scanner-fullscreen [data-admin-banner],
        body.admin-scanner-fullscreen [data-app-version] {
          display: none !important;
        }

        body.admin-scanner-fullscreen [data-admin-layout] {
          min-height: 100dvh;
          padding: 0 !important;
          background: transparent !important;
        }

        body.admin-scanner-fullscreen [data-admin-layout] > div {
          max-width: none !important;
          width: 100% !important;
          margin: 0 !important;
          gap: 0 !important;
        }

        #${READER_ID} {
          position: relative;
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
