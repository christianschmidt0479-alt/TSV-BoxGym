"use client"

import { useState, useTransition } from "react"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"

export function FerienmodusToggleClient({ initialAktiv }: { initialAktiv: boolean }) {
  const [checked, setChecked] = useState(initialAktiv)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleToggle(next: boolean) {
    setChecked(next)
    setSuccess(null)
    startTransition(async () => {
      const res = await fetch("/api/admin/checkin-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disableCheckinTimeWindow: next }),
      })
      if (res.ok) {
        setSuccess(next ? "Ferienmodus aktiviert" : "Ferienmodus deaktiviert")
      } else {
        setSuccess("Fehler beim Speichern")
        setChecked(!next)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1 min-w-[80px]">
      <Switch checked={checked} onCheckedChange={handleToggle} aria-label="Ferienmodus umschalten" disabled={isPending} />
      {success && (
        <Badge variant={success.startsWith("Fehler") ? "destructive" : "default"} className="mt-1">{success}</Badge>
      )}
    </div>
  )
}