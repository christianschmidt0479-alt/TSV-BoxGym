"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"

/**
 * /checkin/erfolg
 * Check-in Success Confirmation Page
 *
 * Query params:
 * - ?id=checkinId (required)
 *
 * Security:
 * - id parameter validation (no blind rendering)
 * - auto-redirect if missing
 */
export default function CheckinSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const checkinId = searchParams?.get("id")
  const [countdown, setCountdown] = useState(5)
  const [isValid, setIsValid] = useState(false)

  // ========================================================================
  // VALIDATE ID PARAMETER
  // ========================================================================
  useEffect(() => {
    // Validate checkinId is present and is a reasonable UUID/ID
    if (checkinId && checkinId.length > 0 && checkinId.length < 100) {
      setIsValid(true)
    } else {
      // No valid id - redirect back immediately
      if (process.env.NODE_ENV !== "production") {
        console.warn("Invalid or missing checkin ID, redirecting")
      }
      router.push("/checkin?source=qr")
    }
  }, [checkinId, router])

  // ========================================================================
  // AUTO-REDIRECT AFTER 5 SECONDS
  // ========================================================================
  useEffect(() => {
    if (!isValid) return

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          router.push("/")
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isValid, router])

  // Only render if id is valid
  if (!isValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-slate-600">Wird weitergeleitet...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-green-50 to-emerald-100 px-4 py-8">
      {/* Success Icon */}
      <div className="text-6xl">✅</div>

      {/* Message */}
      <div className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-3xl font-bold text-green-900">Check-in erfolgreich!</h1>
        <p className="text-sm text-green-700">Du bist jetzt eingecheckt.</p>
        <p className="mt-4 text-xs text-green-600 font-mono bg-green-50 rounded p-2">
          ID: {checkinId}
        </p>
      </div>

      {/* Countdown */}
      <div className="rounded-lg bg-white px-6 py-4 text-center shadow">
        <p className="text-sm text-slate-600">
          Weitergeleitet in <span className="font-bold text-green-600">{countdown}</span> Sekunden...
        </p>
      </div>

      {/* Manual Links */}
      <div className="w-full max-w-sm space-y-2 text-center">
        <Link
          href="/"
          className="inline-block rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Zur Startseite
        </Link>
        <p className="text-xs text-slate-600">
          <Link href="/checkin?source=qr" className="text-blue-600 hover:underline">
            Neuer Check-in
          </Link>
        </p>
      </div>
    </div>
  )
}
