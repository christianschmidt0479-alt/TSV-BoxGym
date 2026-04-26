"use client"

import { useState } from "react"

interface ExtendTrialButtonProps {
  memberId: string
}

export default function ExtendTrialButton({ memberId }: ExtendTrialButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleExtend() {
    setStatus("loading")
    setErrorMsg(null)
    try {
      const res = await fetch("/api/trainer/extend-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      })
      const data = await res.json()
      if (data.ok) {
        setStatus("done")
      } else {
        setStatus("error")
        setErrorMsg(data.error ?? "Unbekannter Fehler")
      }
    } catch {
      setStatus("error")
      setErrorMsg("Netzwerkfehler")
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
        Mitglied bis 8 Einheiten freigegeben
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleExtend}
        disabled={status === "loading"}
          className="min-h-11 w-full rounded-lg bg-amber-500 px-4 py-3 text-base font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60 sm:w-auto"
      >
        {status === "loading" ? "Wird verlängert…" : "Probetraining verlängern"}
      </button>
      {status === "error" && errorMsg && (
        <div className="text-xs text-red-600">{errorMsg}</div>
      )}
    </div>
  )
}
