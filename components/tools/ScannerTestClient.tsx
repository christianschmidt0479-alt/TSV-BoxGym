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
}

const READER_ID = "admin-tools-scanner-reader"
const COOLDOWN_MS = 1800
const SUCCESS_STATUS_MS = 2200
const SCANNER_FPS = 12

type StopReason = "manual" | "visibility" | "error"

const MODE_LABEL: Record<ScannerMode, string> = {
  test: "Testmodus",
  member: "Mitglieder-Modus (vorbereitet)",
  ticket: "Ticket-Modus (vorbereitet)",
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

export function ScannerTestClient({ mode = "test" }: ScannerTestClientProps) {
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scannerError, setScannerError] = useState("")
  const [latestResult, setLatestResult] = useState("")
  const [history, setHistory] = useState<ScanEntry[]>([])
  const [cameraUnsupported, setCameraUnsupported] = useState(false)
  const [statusTone, setStatusTone] = useState<"ready" | "success" | "error">("ready")
  const [statusText, setStatusText] = useState("Scanner gestoppt. Kamera starten, um zu scannen.")

  const scannerRef = useRef<Html5QrcodeInstance | null>(null)
  const sequenceRef = useRef(1)
  const lastScanRef = useRef<{ value: string; time: number }>({ value: "", time: 0 })
  const startLockRef = useRef(false)
  const stopLockRef = useRef(false)
  const mountedRef = useRef(true)
  const successResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasPausedByVisibilityRef = useRef(false)

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
            addScanToHistory(decodedText)
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
            addScanToHistory(decodedText)
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
  }, [addScanToHistory, cameraUnsupported, isScanning, isStarting, setStatus, stopScanner])

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

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Kamera-Scanner (Testmodus)</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Scannt QR-Codes nur lokal im Browser. Es werden keine Daten gespeichert oder weitergeleitet.
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Aktiver Modus: {MODE_LABEL[mode]}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void startScanner()
            }}
            disabled={isStarting || isScanning || cameraUnsupported}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isStarting ? "Starte..." : "Kamera starten"}
          </button>
          <button
            type="button"
            onClick={() => {
              void stopScanner()
            }}
            disabled={isStopping || !isScanning}
            className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isStopping ? "Stoppt..." : "Kamera stoppen"}
          </button>
        </div>
      </div>

      {cameraUnsupported && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Dieser Browser unterstuetzt keinen Kamera-Zugriff. Bitte Safari, Chrome oder Edge auf einem
          Smartphone nutzen.
        </div>
      )}

      <div className={`mt-4 rounded-2xl border px-4 py-4 ${statusStyle}`}>
        <div className="text-xs font-semibold uppercase tracking-wide">Status</div>
        <div className="mt-1 text-lg font-bold">{statusText}</div>
      </div>

      {scannerError && (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {scannerError}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div id={READER_ID} className="min-h-[260px] overflow-hidden rounded-lg bg-black/90" />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Letztes Ergebnis</div>
          <div className="mt-2 break-all rounded-lg bg-white p-3 text-base font-semibold text-zinc-900">
            {latestResult || "Noch kein QR-Code erkannt"}
          </div>

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
        </div>
      </div>
    </section>
  )
}
