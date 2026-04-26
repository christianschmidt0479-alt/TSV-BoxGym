"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

/**
 * /checkin
 * QR/NFC Entry Point for Check-in
 *
 * Accepts query parameters:
 * - ?source=qr|nfc (default: qr, validated server-side)
 * - ?entry=gym (optional, validated server-side, for QR hardening)
 *
 * Routes to:
 * - Member check-in: /api/checkin/member
 * - Trainer check-in: /verwaltung-neu/checkin?source=trainer
 *
 * Security:
 * - source: displayed locally, validated server-side against allowlist
 * - entry: optional, validated server-side
 * - mode/limits: NEVER sent from client, always computed server-side
 */
function CheckinPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ========================================================================
  // READ & VALIDATE SOURCE (display only, server validates)
  // ========================================================================
  const source =
    searchParams?.get("source") === "nfc"
      ? "nfc"
      : searchParams?.get("source") === "form"
        ? "form"
        : "qr"

  // ========================================================================
  // READ & VALIDATE ENTRY (optional, for QR hardening)
  // ========================================================================
  const entry = searchParams?.get("entry") === "gym" ? "gym" : null

  const [email, setEmail] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [autoCheckDone, setAutoCheckDone] = useState(false)

  useEffect(() => {
    let mounted = true

    async function tryFastCheckin() {
      try {
        const storedToken = localStorage.getItem("checkin_device_token")
        if (!storedToken) {
          if (mounted) setAutoCheckDone(true)
          return
        }

        const res = await fetch("/api/checkin/member", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceToken: storedToken,
            source,
            entry,
          }),
        })

        const data = (await res.json()) as {
          ok?: boolean
          error?: string
          checkinId?: string
          deviceToken?: string
        }

        if (res.ok && data.ok && data.checkinId) {
          if (data.deviceToken) {
            localStorage.setItem("checkin_device_token", data.deviceToken)
          }
          router.push(`/checkin/erfolg?id=${data.checkinId}`)
          return
        }

        // Invalid/expired/deleted-member token: fallback to normal login flow.
        localStorage.removeItem("checkin_device_token")
      } catch {
        // Network or parse issue: keep normal login flow available.
      }

      if (mounted) {
        setAutoCheckDone(true)
      }
    }

    void tryFastCheckin()

    return () => {
      mounted = false
    }
  }, [entry, router, source])

  const handleMemberCheckin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/checkin/member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          pin,
          source,
          entry,
        }),
      })

      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        reason?: string
        checkinId?: string
        deviceToken?: string
      }

      if (!res.ok || !data.ok) {
        if (data.reason === "LIMIT_TRIAL") {
          setError("Du hast die maximale Anzahl an Probetrainings erreicht.")
          return
        }
        const uiError = (data.error || "Fehler beim Check-in").replaceAll("PIN", "Passwort")
        setError(uiError)
        return
      }

      // ====================================================================
      // SUCCESS: Track device for fast check-in preparation
      // ====================================================================
      // Store device indicator for potential auto-checkin in future
      // This is a local flag only - no server-side session needed
      try {
        localStorage.setItem("checkin_device_enabled", "true")
        localStorage.setItem("checkin_device_email", email)
        localStorage.setItem("checkin_device_timestamp", Date.now().toString())
        if (data.deviceToken) {
          localStorage.setItem("checkin_device_token", data.deviceToken)
        }
      } catch (storageError) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Could not store device info:", storageError)
        }
      }

      // Redirect to success page
      router.push(`/checkin/erfolg?id=${data.checkinId}`)
    } catch (err) {
      setError("Fehler beim Check-in")
      if (process.env.NODE_ENV !== "production") {
        console.error("Check-in error:", err)
      }
    } finally {
      setLoading(false)
    }
  }

  if (!autoCheckDone) {
    return (
      <div className="min-h-screen pt-8 pb-12 flex items-start justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md mt-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 text-center text-sm text-gray-600">
            Bekannte Geräteprüfung läuft...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-8 pb-12 flex items-start justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md mt-4">
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 text-center">
          <img src="/logo.png" alt="TSV Falkensee" className="h-16 mx-auto mb-3" />
          <h1 className="text-lg font-semibold">Check-in</h1>
          <p className="text-sm text-gray-500">Zugang nur für registrierte Mitglieder</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          

          {error ? (
            <div className="text-sm text-red-600 text-center">{error}</div>
          ) : null}

          <form onSubmit={handleMemberCheckin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-gray-300 px-3 py-3 text-sm"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Passwort</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-gray-300 px-3 py-3 text-sm"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email || !pin}
              className="w-full bg-[#0f2a44] hover:bg-[#13365a] text-white py-3 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Wird geprüft..." : "Einchecken"}
            </button>
          </form>

          <div className="text-xs text-gray-500 text-center">
            Kein Zugang? Bitte zuerst registrieren.
          </div>
          <a
            href="/checkin/beitritt"
            className="text-sm text-blue-700 underline block text-center"
          >
            Zur Registrierung
          </a>
        </div>
      </div>
    </div>
  )
}

export default function CheckinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen pt-8 pb-12 flex items-start justify-center bg-gray-50 px-4">
          <div className="w-full max-w-md mt-4">
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 text-center text-sm text-gray-600">
              Seite wird geladen...
            </div>
          </div>
        </div>
      }
    >
      <CheckinPageContent />
    </Suspense>
  )
}
