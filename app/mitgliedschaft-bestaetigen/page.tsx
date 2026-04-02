"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type ConfirmationState =
  | { status: "loading" }
  | { status: "success"; alreadyConfirmed: boolean }
  | { status: "error"; message: string }

export default function MitgliedschaftBestaetigenPage() {
  const [state, setState] = useState<ConfirmationState>({ status: "loading" })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("token")?.trim() ?? ""

    if (!token) {
      setState({ status: "error", message: "Bestätigungslink fehlt oder ist ungültig." })
      return
    }

    ;(async () => {
      try {
        const response = await fetch("/api/public/gs-membership-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })

        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string; alreadyConfirmed?: boolean }
          | null

        if (!response.ok || !payload?.ok) {
          setState({ status: "error", message: payload?.error || "Bestätigung fehlgeschlagen." })
          return
        }

        setState({ status: "success", alreadyConfirmed: !!payload.alreadyConfirmed })
      } catch {
        setState({ status: "error", message: "Bestätigung fehlgeschlagen." })
      }
    })()
  }, [])

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 md:px-6">
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitgliedschaft bestätigen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.status === "loading" ? <div className="text-sm text-zinc-600">Bestätigung wird verarbeitet...</div> : null}
          {state.status === "success" ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {state.alreadyConfirmed
                ? "Die Mitgliedschaft wurde bereits bestätigt."
                : "Die Mitgliedschaft wurde bestätigt. Im Adminbereich wird der Freigeben-Button jetzt grün angezeigt."}
            </div>
          ) : null}
          {state.status === "error" ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{state.message}</div>
          ) : null}
          <Button asChild className="rounded-2xl bg-[#154c83] text-white hover:bg-[#123d69]">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}