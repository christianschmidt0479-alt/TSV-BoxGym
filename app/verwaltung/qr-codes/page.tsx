"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, ExternalLink, Printer, ScanLine } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { buildAdminQrEntries, type AdminQrEntry } from "@/lib/adminQrEntries"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { clearTrainerAccessSession } from "@/lib/trainerAccess"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"

export default function VerwaltungQrCodesPage() {
  const router = useRouter()
  const [resolvedBaseUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.origin.replace(/\/+$/, "")
    }

    const appBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
    return appBaseUrl.replace(/\/+$/, "")
  })
  const [memberQrUrl, setMemberQrUrl] = useState("")
  const [trialQrUrl, setTrialQrUrl] = useState("")

  const loadQrUrl = useCallback(async (panel: "member" | "trial") => {
    const response = await fetch(`/api/qr-access-url?panel=${panel}`)

    if (response.status === 401 || response.status === 403) {
      await clearTrainerAccessSession({ remote: false })
      router.replace("/trainer-zugang")
      router.refresh()
      return false
    }

    if (!response.ok) {
      return false
    }

    const payload = (await response.json()) as { url?: string }
    if (panel === "member") {
      setMemberQrUrl(payload.url?.trim() ?? "")
    } else {
      setTrialQrUrl(payload.url?.trim() ?? "")
    }

    return true
  }, [router])

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadQrUrl("member"), loadQrUrl("trial")])
      } catch (error) {
        console.error("qr code urls failed", error)
      }
    })()
  }, [loadQrUrl])

  const qrEntries: AdminQrEntry[] = buildAdminQrEntries({
    baseUrl: resolvedBaseUrl,
    memberQrUrl,
    trialQrUrl,
  })

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
          <p className="text-sm text-zinc-600">Drei gleich grosse QR-Karten für Registrierung, Mitglieder-Check-in und Probetraining.</p>
        </div>
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/qr-druck?scope=all" target="_blank" rel="noreferrer">
            <Printer className="mr-2 h-4 w-4" />
            Alle drucken
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {qrEntries.map((entry) => (
          <Card key={entry.key} className="h-full rounded-[24px] border-0 shadow-sm">
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
                      Öffnen
                    </a>
                  </Button>
                  <Button variant="outline" className="rounded-2xl" onClick={() => copyUrl(entry.url, entry.title)} disabled={!entry.url}>
                    <Copy className="mr-2 h-4 w-4" />
                    Link kopieren
                  </Button>
                  <Button asChild variant="outline" className="rounded-2xl" disabled={!entry.url}>
                    <Link href={`/qr-druck?scope=${encodeURIComponent(entry.key)}`} target="_blank" rel="noreferrer">
                      <Printer className="mr-2 h-4 w-4" />
                      Drucken
                    </Link>
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
        Info: Für einen DIN-A4-Druck nutze Hochformat und entferne Kopf- und Fusszeilen im Druckdialog, damit die QR-Codes sauber lesbar bleiben.
      </div>
    </div>
  )
}
