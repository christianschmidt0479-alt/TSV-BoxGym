"use client"

import Link from "next/link"
import QRCode from "react-qr-code"
import { useRef } from "react"
import { ScannerTestClient } from "@/components/tools/ScannerTestClient"

export default function QRCodePage() {
  const QR_DOWNLOAD_SIZE = 1024
  const NFC_DOWNLOAD_SIZE = 1024
  const checkinUrl = "https://www.tsvboxgym.de/checkin/mitglied"
  const registrationUrl = "https://www.tsvboxgym.de/checkin/beitritt"
  const trialUrl = "https://www.tsvboxgym.de/registrieren/probe"

  const checkinQrRef = useRef<HTMLDivElement | null>(null)
  const registrationQrRef = useRef<HTMLDivElement | null>(null)
  const trialQrRef = useRef<HTMLDivElement | null>(null)

  function downloadQR(dataUrl: string, filename: string) {
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = `${filename}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function downloadRenderedQr(container: HTMLDivElement | null, filename: string) {
    if (!container) return

    const svg = container.querySelector("svg")
    if (!svg) return

    const serializedSvg = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([serializedSvg], { type: "image/svg+xml;charset=utf-8" })
    const svgUrl = URL.createObjectURL(svgBlob)

    try {
      const image = new Image()
      image.decoding = "async"

      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error("QR image load failed"))
      })

      image.src = svgUrl
      await loaded

      const canvas = document.createElement("canvas")
      canvas.width = QR_DOWNLOAD_SIZE
      canvas.height = QR_DOWNLOAD_SIZE

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

      const dataUrl = canvas.toDataURL("image/png")
      downloadQR(dataUrl, filename)
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  }

  function downloadFile(path: string, name: string) {
    const a = document.createElement("a")
    a.href = path
    a.download = name
    a.click()
  }

  async function downloadNfcLogoHighRes() {
    const img = new Image()
    img.src = "/assets/nfc-logo.png"

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("NFC logo load failed"))
    })

    const canvas = document.createElement("canvas")
    canvas.width = NFC_DOWNLOAD_SIZE
    canvas.height = NFC_DOWNLOAD_SIZE

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL("image/png")

    const a = document.createElement("a")
    a.href = dataUrl
    a.download = "nfc-logo-highres.png"
    a.click()
  }

  const downloads = [
    {
      title: "TSV BoxGym Logo",
      imagePath: "/assets/tsv-logo.png",
      imageAlt: "TSV BoxGym Logo",
      actions: [
        { path: "/assets/tsv-logo.png", name: "tsv-boxgym-logo.png", label: "PNG herunterladen" },
        { path: "/assets/tsv-logo.svg", name: "tsv-boxgym-logo.svg", label: "SVG herunterladen" },
      ],
    },
    {
      title: "NFC Logo",
      imagePath: "/assets/nfc-logo.png",
      imageAlt: "NFC Logo",
      actions: [
        { path: "/assets/nfc-logo.png", name: "nfc-logo.png", label: "PNG herunterladen" },
        { path: "/assets/nfc-logo.svg", name: "nfc-logo.svg", label: "SVG herunterladen" },
      ],
    },
  ]

  return (
    <>
      <div className="flex justify-center items-start p-0">
        <div className="w-full max-w-xl mx-auto">
          <div className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-900">Trainer QR-Check-in (Vorbereitung)</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Persönlichen Mitglieder-QR scannen, Mitgliedsdaten prüfen und Check-in auslösen.
              Testphase ohne neue Check-in-Logik.
            </p>
            <div className="mt-4">
              <ScannerTestClient mode="member" enableMemberCheckinAction />
            </div>
          </div>

          {/* CHECK-IN */}
          <div className="bg-white p-8 border border-gray-200 rounded-xl text-center">
            <h1 className="text-xl font-semibold mb-6">TSV BoxGym Check-in</h1>

            <div ref={checkinQrRef} className="flex justify-center mb-6">
              <QRCode value={checkinUrl} size={220} />
            </div>

            <button
              type="button"
              onClick={() => {
                void downloadRenderedQr(checkinQrRef.current, "checkin-eingang")
              }}
              className="px-4 py-2 bg-[#0f2a44] text-white rounded-md"
            >
              Download
            </button>

            <div className="text-sm text-gray-700 space-y-2">
              <p>Bitte QR-Code scannen, um sich einzuchecken.</p>
              <p>Alternativ kann auch der NFC-Punkt verwendet werden.</p>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              <p>NFC-Punkt befindet sich am Eingang.</p>
            </div>

            <div className="mt-6">
              <Link href="/verwaltung-neu/qr-code/print" target="_blank">
                <button className="mt-4 px-4 py-2 bg-[#0f2a44] text-white rounded-md">
                  Druckversion öffnen
                </button>
              </Link>
            </div>
          </div>

          {/* REGISTRIERUNG + PROBEMITGLIED */}
          <div className="mt-10 space-y-8">

            {/* REGISTRIERUNG */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
              <h2 className="text-lg font-semibold mb-4">Registrierung</h2>
              <div ref={registrationQrRef} className="flex justify-center">
                <QRCode value={registrationUrl} size={180} />
              </div>
              <p className="mt-3 text-sm text-gray-600">Neues Mitglied registrieren</p>
              <button
                type="button"
                onClick={() => {
                  void downloadRenderedQr(registrationQrRef.current, "checkin-mitglied")
                }}
                className="mt-4 px-4 py-2 bg-[#0f2a44] text-white rounded-md text-sm"
              >
                Download
              </button>
            </div>

            {/* PROBEMITGLIED */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
              <h2 className="text-lg font-semibold mb-4">Probetraining Registrierung</h2>
              <div ref={trialQrRef} className="flex justify-center">
                <QRCode value={trialUrl} size={180} />
              </div>
              <p className="mt-3 text-sm text-gray-600">Direkt zur Probetraining-Registrierung</p>
              <button
                type="button"
                onClick={() => {
                  void downloadRenderedQr(trialQrRef.current, "checkin-probetraining")
                }}
                className="mt-4 px-4 py-2 bg-[#0f2a44] text-white rounded-md text-sm"
              >
                Download
              </button>
            </div>

          </div>

          <div className="mt-10 bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Downloads</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {downloads.map((item) => (
                <div key={item.title} className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <div className="aspect-[4/3] rounded-lg border border-gray-200 bg-white flex items-center justify-center p-4">
                    <img src={item.imagePath} alt={item.imageAlt} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="mt-4">
                    <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.actions.map((action) => (
                      <button
                        key={action.path}
                        type="button"
                        onClick={() => downloadFile(action.path, action.name)}
                        className="px-3 py-2 bg-[#0f2a44] text-white rounded-md text-sm"
                      >
                        {action.label}
                      </button>
                    ))}
                    {item.title === "NFC Logo" ? (
                      <button
                        type="button"
                        onClick={() => {
                          void downloadNfcLogoHighRes()
                        }}
                        className="px-3 py-2 bg-[#0f2a44] text-white rounded-md text-sm"
                      >
                        NFC Logo Download (HD)
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            margin: 0;
          }
        }
      `}</style>
    </>
  )
}
