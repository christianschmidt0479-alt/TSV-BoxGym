
"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"

type ConfirmState = "loading" | "success" | "error"

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function GsMembershipConfirmationClient() {
  const params = useParams<{ decision?: string; token?: string }>()
  const decision = useMemo(() => toText(params?.decision).toLowerCase(), [params])
  const token = useMemo(() => toText(params?.token), [params])

  const [state, setState] = useState<ConfirmState>("loading")
  const [message, setMessage] = useState("Bestätigung wird geprüft...")

  useEffect(() => {
    let active = true

    async function runConfirmation() {
      if (decision !== "yes") {
        if (!active) return
        setState("error")
        setMessage("Nur der Ja-Link ist für diese Bestätigung gültig.")
        return
      }

      if (!token) {
        if (!active) return
        setState("error")
        setMessage("Der Bestätigungslink ist ungültig.")
        return
      }

      try {
        const response = await fetch("/api/public/member-area", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "verify_email", token }),
        })

        const payload = (await response.json().catch(() => ({}))) as { error?: string }

        if (!active) return

        if (!response.ok) {
          setState("error")
          setMessage(payload.error || "Bestätigung fehlgeschlagen.")
          return
        }

        setState("success")
        setMessage("Deine E-Mail wurde erfolgreich bestätigt.")
      } catch {
        if (!active) return
        setState("error")
        setMessage("Bestätigung fehlgeschlagen.")
      }
    }

    void runConfirmation()

    return () => {
      active = false
    }
  }, [decision, token])

  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <p>{state === "loading" ? "Bitte kurz warten..." : state === "success" ? "Bestätigung erfolgreich" : "Bestätigung fehlgeschlagen"}</p>
      <p>{message}</p>
    </div>
  )
}

export default GsMembershipConfirmationClient