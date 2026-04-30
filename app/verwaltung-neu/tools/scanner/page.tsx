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
  const [isStarting, setIsStarting] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [resultText, setResultText] = useState("")
  const [errorText, setErrorText] = useState("")

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
  }, [])

  const startScanner = useCallback(async () => {
    if (isStarting || isScanning) {
      return
    }

    setIsStarting(true)
    setErrorText("")

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
            setResultText(decodedText)
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
            setResultText(decodedText)
          },
          () => {
            // No-op to avoid noisy "no QR" status updates.
          },
        )
      }

      setIsScanning(true)
    } catch (error) {
      await stopScanner()
      setErrorText(mapCameraError(error))
    } finally {
      setIsStarting(false)
    }
  }, [isScanning, isStarting, stopScanner])

  useEffect(() => {
    return () => {
      void stopScanner()
    }
  }, [stopScanner])

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Scanner (Test)</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Isolierter QR-Scanner ohne Check-in, ohne API und ohne Speicherung.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void startScanner()
            }}
            disabled={isStarting || isScanning}
            className="inline-flex items-center justify-center rounded-lg bg-[#154c83] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f3f70] disabled:cursor-not-allowed disabled:bg-[#7f9dbb]"
          >
            {isStarting ? "Starte..." : "Kamera starten"}
          </button>

          <button
            type="button"
            onClick={() => {
              void stopScanner()
            }}
            disabled={!isScanning}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            Kamera stoppen
          </button>
        </div>

        {errorText && (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorText}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Kamera</h2>
        <p className="mt-1 text-sm text-zinc-600">Kamera startet nur manuell per Button.</p>

        <div className="mt-3 w-full overflow-hidden rounded-xl border border-zinc-200 bg-black p-2">
          <div id={READER_ID} className="w-full" />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Ergebnis</h2>
        <div className="mt-3 break-all rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900">
          {resultText || "Noch kein QR-Code erkannt."}
        </div>
      </section>
    </div>
  )
}
