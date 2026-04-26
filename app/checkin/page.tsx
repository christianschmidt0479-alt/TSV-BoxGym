"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

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

  const [mode, setMode] = useState<"member" | "trainer" | null>(null)
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
        setError(data.error || "Fehler beim Check-in")
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

  const handleTrainerRedirect = () => {
    // Route to trainer check-in with source parameter
    router.push("/verwaltung-neu/checkin?source=trainer")
  }

  if (!autoCheckDone) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center text-sm text-slate-600 shadow">
          Bekannte Geraetepruefung laeuft...
        </div>
      </div>
    )
  }

  // Mode selection screen
  if (!mode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-2 text-3xl font-bold text-slate-900">Check-in</h1>
          <p className="text-sm text-slate-600">
            {source === "nfc" ? "NFC Scan erkannt" : "QR Code erkannt"}
          </p>
        </div>

        {/* Buttons */}
        <div className="w-full max-w-sm space-y-3">
          <button
            onClick={() => setMode("member")}
            className="w-full rounded-lg bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-md transition-all hover:bg-blue-700 active:scale-95"
          >
            Ich bin Mitglied
          </button>

          <button
            onClick={handleTrainerRedirect}
            className="w-full rounded-lg bg-slate-700 px-6 py-4 text-base font-semibold text-white shadow-md transition-all hover:bg-slate-800 active:scale-95"
          >
            Trainer Check-in
          </button>
        </div>

        {/* Debug Info (production hidden) */}
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-8 w-full max-w-sm rounded-lg bg-white p-4 text-xs text-slate-600 font-mono space-y-1">
            <p>source: {source}</p>
            {entry && <p>entry: {entry}</p>}
          </div>
        )}
      </div>
    )
  }

  // Member check-in form
  if (mode === "member") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-6 text-center">
            <h1 className="mb-2 text-2xl font-bold text-slate-900">Mitglied Login</h1>
            <p className="text-sm text-slate-600">E-Mail und PIN eingeben</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleMemberCheckin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                E-Mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-base placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-base placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email || !pin}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-md transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Wird geprüft..." : "Check-in"}
            </button>
          </form>

          {/* Back button */}
          <button
            onClick={() => setMode(null)}
            disabled={loading}
            className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
          >
            Zurück
          </button>

          {/* Links */}
          <div className="mt-6 space-y-2 text-center text-xs text-slate-600">
            <p>
              <Link href="/login" className="text-blue-600 hover:underline">
                Zum Login
              </Link>
            </p>
            <p>
              <Link href="/" className="text-slate-600 hover:underline">
                Zur Startseite
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default function CheckinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center text-sm text-slate-600 shadow">
            Seite wird geladen...
          </div>
        </div>
      }
    >
      <CheckinPageContent />
    </Suspense>
  )
}
