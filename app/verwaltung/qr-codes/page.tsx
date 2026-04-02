"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, ExternalLink, Printer, ScanLine } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { clearTrainerAccessSession } from "@/lib/trainerAccess"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"

type QrEntry = {
  title: string
  description: string
  url: string
  alt: string
  eyebrow: string
  helper: string
}

export default function VerwaltungQrCodesPage() {
  const router = useRouter()
  const [resolvedBaseUrl, setResolvedBaseUrl] = useState(() => {
    const appBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
    return appBaseUrl.replace(/\/+$/, "")
  })
  const [memberQrUrl, setMemberQrUrl] = useState("")
  const [trialQrUrl, setTrialQrUrl] = useState("")

  useEffect(() => {
    if (typeof window !== "undefined") {
      setResolvedBaseUrl(window.location.origin.replace(/\/+$/, ""))
    }

    void (async () => {
      try {
        const [memberResponse, trialResponse] = await Promise.all([
          fetch("/api/qr-access-url?panel=member"),
          fetch("/api/qr-access-url?panel=trial"),
        ])

        if ([memberResponse.status, trialResponse.status].some((status) => status === 401 || status === 403)) {
          await clearTrainerAccessSession({ remote: false })
          router.replace("/trainer-zugang")
          router.refresh()
          return
        }

        if (memberResponse.ok) {
          const payload = (await memberResponse.json()) as { url?: string }
          setMemberQrUrl(payload.url?.trim() ?? "")
        }

        if (trialResponse.ok) {
          const payload = (await trialResponse.json()) as { url?: string }
          setTrialQrUrl(payload.url?.trim() ?? "")
        }
      } catch (error) {
        console.error("qr code urls failed", error)
      }
    })()
  }, [router])

  const qrEntries: QrEntry[] = [
    {
      title: "TSV Boxbereiche Mitglieder registrieren",
      description: "Der zentrale QR-Code fuer die Registrierung im Boxbereich. Geeignet fuer Handyansicht, Aushang und direkte Ausgabe im Gym.",
      url: `${resolvedBaseUrl}/tsv-mitglied-registrieren`,
      alt: "QR-Code TSV Boxbereiche Mitglieder registrieren",
      eyebrow: "Registrierung",
      helper: "Fuer TSV-Mitglieder oder Personen, die parallel die TSV-Mitgliedschaft beantragen.",
    },
    {
      title: "Mitglieder Check-in",
      description: "Fuehrt direkt zum QR-Zugang fuer regulaere Mitglieder im Trainingsbetrieb.",
      url: memberQrUrl,
      alt: "QR-Code Mitglieder Check-in",
      eyebrow: "Check-in",
      helper: "Fuer den regulaeren Zugang im Mitgliedsbereich.",
    },
    {
      title: "Probetraining Check-in",
      description: "Direkter Zugang zum Probetraining-Panel fuer neue Sportler und Testtermine.",
      url: trialQrUrl,
      alt: "QR-Code Probetraining Check-in",
      eyebrow: "Check-in",
      helper: "Nur fuer Probetraining und entsprechende Trainerbegleitung.",
    },
  ]

  async function copyUrl(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      alert(`${label} kopiert.`)
    } catch (error) {
      console.error(error)
      alert(`${label} konnte nicht kopiert werden.`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#154c83]/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#154c83]">
            <ScanLine className="h-3.5 w-3.5" />
            Zentraler QR-Bereich
          </div>
          <h1 className="mt-3 text-2xl font-bold text-[#154c83]">QR-Codes</h1>
          <p className="text-sm text-zinc-600">Drei gleich grosse QR-Karten fuer Registrierung, Mitglieder-Check-in und Probetraining.</p>
        </div>
        <Button variant="outline" className="rounded-2xl" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Alle drucken
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {qrEntries.map((entry) => (
          <Card key={entry.title} className="h-full rounded-[24px] border-0 shadow-sm">
            <CardContent className="flex h-full flex-col gap-5 p-5">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#154c83]/8 px-3 py-1 text-xs font-semibold tracking-wide text-[#154c83]">
                  <ScanLine className="h-4 w-4" />
                  {entry.eyebrow}
                </div>
                <div className="mt-3 text-xl font-bold tracking-tight text-zinc-900">{entry.title}</div>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{entry.description}</p>
                <div className="mt-4 rounded-2xl border border-[#d8e3ee] bg-[#f7fbff] px-4 py-3 text-sm text-[#244566]">
                  {entry.helper}
                </div>
                <div className="mt-4 break-all rounded-2xl bg-zinc-100 px-3 py-2 text-xs text-zinc-500">{entry.url || "QR-Link wird geladen..."}</div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]" disabled={!entry.url}>
                    <a href={entry.url || "#"} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Oeffnen
                    </a>
                  </Button>
                  <Button variant="outline" className="rounded-2xl" onClick={() => copyUrl(entry.url, entry.title)} disabled={!entry.url}>
                    <Copy className="mr-2 h-4 w-4" />
                    Link kopieren
                  </Button>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-center">
                <div className="rounded-[28px] border border-[#d8e3ee] bg-white p-4 shadow-sm">
                  {entry.url ? (
                    <div className="w-56 max-w-full">
                      <QRCodeSVG
                        value={entry.url}
                        title={entry.alt}
                        size={224}
                        level="M"
                        marginSize={2}
                        bgColor="#ffffff"
                        fgColor="#111827"
                        className="block h-auto w-full rounded-2xl"
                      />
                    </div>
                  ) : (
                    <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-zinc-100 text-sm text-zinc-500">QR-Link wird geladen...</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500">
        Info: Fuer einen DIN-A4-Druck nutze Hochformat und entferne Kopf- und Fusszeilen im Druckdialog, damit die QR-Codes sauber lesbar bleiben.
      </div>
    </div>
  )
}
