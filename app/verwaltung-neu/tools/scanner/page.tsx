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
            const normalized = decodedText.trim()
            if (!normalized || normalized === lastRawRef.current) {
              return
            }

            lastRawRef.current = normalized
            lastValidatedTokenRef.current = ""
            const classification = classifyQrContent(normalized)
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
            const normalized = decodedText.trim()
            if (!normalized || normalized === lastRawRef.current) {
              return
            }

            lastRawRef.current = normalized
            lastValidatedTokenRef.current = ""
            const classification = classifyQrContent(normalized)
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
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">Scanner (Test)</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Isolierter QR-Scanner als Pruef-Tool ohne Check-in und ohne Datenaenderung.
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
        {lastScan ? (
          <div className="mt-3 space-y-3">
            <div
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                lastScan.classification.type === "member"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : lastScan.classification.type === "unknown"
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-red-300 bg-red-50 text-red-700"
              }`}
            >
              Typ: {lastScan.classification.type === "member" ? "Mitglied" : lastScan.classification.type === "unknown" ? "Unbekannt" : "Ungültig"}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Rohwert</div>
              <div className="mt-1 break-all">{lastScan.classification.raw}</div>
            </div>

            {lastScan.classification.token && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Token</div>
                <div className="mt-1 break-all">{shortenToken(lastScan.classification.token)}</div>
              </div>
            )}

            {lastScan.classification.type === "member" && lastScan.classification.token && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Validierung</div>
                  {validationResult?.isTestData && (
                    <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      TESTDATEN
                    </span>
                  )}
                </div>

                {validationLoading && <div className="mt-2 text-sm text-zinc-600">Pruefung laeuft...</div>}

                {validationError && (
                  <div className="mt-2 rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-700">
                    {validationError}
                  </div>
                )}

                {validationResult && !validationLoading && (
                  <div className="mt-2 space-y-1">
                    <div>
                      <span className="font-semibold">Mitglied:</span>{" "}
                      {validationResult.found ? "Gefunden" : "Nicht gefunden"}
                    </div>
                    <div>
                      <span className="font-semibold">Name:</span>{" "}
                      {validationResult.name || "-"}
                    </div>
                    <div>
                      <span className="font-semibold">Gruppe:</span>{" "}
                      {validationResult.group || "-"}
                    </div>
                    <div>
                      <span className="font-semibold">Status:</span>{" "}
                      {validationResult.status || (validationResult.found ? "Unbekannt" : "Nicht vorhanden")}
                    </div>
                    <div>
                      <span className="font-semibold">Rollenflags:</span>{" "}
                      {[
                        validationResult.roleFlags.isCompetitionMember ? "Wettkaempfer" : null,
                        validationResult.roleFlags.isPerformanceGroup ? "Leistungsgruppe" : null,
                        validationResult.roleFlags.isTrial ? "Probemitglied" : null,
                      ].filter(Boolean).join(", ") || "Keine"}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Quelle: {validationResult.source === "simulation" ? "Lokale Simulation" : "Read-only API"}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-zinc-500">Letzter Scan: {lastScan.at}</div>
          </div>
        ) : (
          <div className="mt-3 break-all rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900">
            Noch kein QR-Code erkannt.
          </div>
        )}
      </section>
    </div>
  )
}
