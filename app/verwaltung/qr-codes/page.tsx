"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function getQrImageUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=16&data=${encodeURIComponent(value)}`
}

export default function VerwaltungQrCodesPage() {
  const [memberRegistrationUrl] = useState(() =>
    typeof window !== "undefined" ? `${window.location.origin}/tsv-mitglied-registrieren` : ""
  )
  const [checkinUrl, setCheckinUrl] = useState("")
  const [trialCheckinUrl, setTrialCheckinUrl] = useState("")

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const [memberResponse, trialResponse] = await Promise.all([
          fetch("/api/qr-access-url?panel=member"),
          fetch("/api/qr-access-url?panel=trial"),
        ])

        if (!memberResponse.ok || !trialResponse.ok) return

        const memberData = (await memberResponse.json()) as { url?: string }
        const trialData = (await trialResponse.json()) as { url?: string }

        if (!cancelled) {
          setCheckinUrl(memberData.url ?? "")
          setTrialCheckinUrl(trialData.url ?? "")
        }
      } catch (error) {
        console.error("QR URLs konnten nicht geladen werden", error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#154c83]">QR Codes</h1>
          <p className="text-sm text-zinc-600">Druckfertige QR-Codes für Mitgliedregistrierung und Checkin.</p>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Zum Drucken (DIN A4)
        </Button>
      </div>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitglied registrieren</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <p className="text-sm text-zinc-700">
              URL: <strong>{memberRegistrationUrl || "-"}</strong>
            </p>
            <p className="text-sm text-zinc-600">Scanne diesen Code und öffne sofort das Registrierungsformular.</p>
            <a target="_blank" rel="noreferrer" href={memberRegistrationUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-[#154c83] hover:underline">
              Direkt öffnen <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div className="flex items-center justify-center">
            {memberRegistrationUrl ? (
              <img
                src={getQrImageUrl(memberRegistrationUrl)}
                alt="QR Code Mitglied registrieren"
                className="h-56 w-56 max-w-full rounded-xl border border-zinc-200 bg-white p-2"
              />
            ) : (
              <div className="h-56 w-56 rounded-xl border border-dashed border-zinc-300" />
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitglied Check-in</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <p className="text-sm text-zinc-700">
              URL: <strong>{checkinUrl || "-"}</strong>
            </p>
            <p className="text-sm text-zinc-600">Scanne diesen Code, um direkt zum Check-in mit QR-Zugang zu gelangen.</p>
            <a target="_blank" rel="noreferrer" href={checkinUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-[#154c83] hover:underline">
              Direkt öffnen <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div className="flex items-center justify-center">
            {checkinUrl ? (
              <img
                src={getQrImageUrl(checkinUrl)}
                alt="QR Code Mitglied Checkin"
                className="h-56 w-56 max-w-full rounded-xl border border-zinc-200 bg-white p-2"
              />
            ) : (
              <div className="h-56 w-56 rounded-xl border border-dashed border-zinc-300" />
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Probetraining Check-in</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <p className="text-sm text-zinc-700">
              URL: <strong>{trialCheckinUrl || "-"}</strong>
            </p>
            <p className="text-sm text-zinc-600">Scanne diesen Code für Probetraining-Checkin (direkt Panel Probetraining).</p>
            <a target="_blank" rel="noreferrer" href={trialCheckinUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-[#154c83] hover:underline">
              Direkt öffnen <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div className="flex items-center justify-center">
            {trialCheckinUrl ? (
              <img
                src={getQrImageUrl(trialCheckinUrl)}
                alt="QR Code Probetraining Checkin"
                className="h-56 w-56 max-w-full rounded-xl border border-zinc-200 bg-white p-2"
              />
            ) : (
              <div className="h-56 w-56 rounded-xl border border-dashed border-zinc-300" />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500">
        Info: Für einen DIN-A4-Druck nutze die Druckvorschau und stelle Layout auf &quot;Hochformat&quot; sowie &quot;Randlos&quot; (falls möglich). Entferne Kopf-/Fußzeilen im Druckdialog.
      </div>
    </div>
  )
}
