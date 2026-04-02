"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { normalizeGsMembershipDecision, type GsMembershipDecision } from "@/lib/gsMembershipConfirmation"

type ConfirmationState =
  | { status: "loading" }
  | { status: "success"; decision: GsMembershipDecision; alreadyProcessed: boolean }
  | { status: "error"; message: string }

type Props = {
  token?: string
  decision?: string
}

export function GsMembershipConfirmationClient({ token, decision }: Props) {
  const [state, setState] = useState<ConfirmationState>({ status: "loading" })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const resolvedToken = token?.trim() || params.get("token")?.trim() || ""
    const resolvedDecision = normalizeGsMembershipDecision(decision || params.get("entscheidung") || params.get("decision") || "ja")

    if (!resolvedToken || !resolvedDecision) {
      setState({ status: "error", message: "Bestätigungslink fehlt oder ist ungültig." })
      return
    }

    ;(async () => {
      try {
        const response = await fetch("/api/public/gs-membership-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resolvedToken, decision: resolvedDecision }),
        })

        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string; alreadyProcessed?: boolean; decision?: string }
          | null

        if (!response.ok || !payload?.ok) {
          setState({ status: "error", message: payload?.error || "Bestätigung fehlgeschlagen." })
          return
        }

        setState({
          status: "success",
          decision: normalizeGsMembershipDecision(payload?.decision) || resolvedDecision,
          alreadyProcessed: !!payload?.alreadyProcessed,
        })
      } catch {
        setState({ status: "error", message: "Bestätigung fehlgeschlagen." })
      }
    })()
  }, [decision, token])

  const isNegative = state.status === "success" && state.decision === "nein"

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 md:px-6">
      <Card className="rounded-[24px] border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Mitgliedschaft rückmelden</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.status === "loading" ? <div className="text-sm text-zinc-600">Rückmeldung wird verarbeitet...</div> : null}
          {state.status === "success" ? (
            <div
              className={
                isNegative
                  ? "rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                  : "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
              }
            >
              {state.decision === "ja"
                ? state.alreadyProcessed
                  ? "Die Mitgliedschaft war bereits als vorhanden bestätigt. Im Adminbereich bleibt der Freigeben-Button grün."
                  : "Die Mitgliedschaft wurde als vorhanden bestätigt. Im Adminbereich wird der Freigeben-Button jetzt grün angezeigt."
                : state.alreadyProcessed
                  ? "Die Mitgliedschaft war bereits als nicht vorhanden markiert. Im Adminbereich bleibt der Freigeben-Button rot."
                  : "Die Mitgliedschaft wurde als nicht vorhanden markiert. Im Adminbereich wird der Freigeben-Button jetzt rot angezeigt."}
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