"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { clearTrainerAccessSession, persistTrainerAccess, readTrainerAccess, TRAINER_SESSION_MAX_AGE_MS } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart"]
const REFRESH_THROTTLE_MS = 60 * 1000

export function TrainerSessionGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const { resolved, role, accountRole, linkedMemberId, accountEmail } = useTrainerAccess()
  const logoutTimeoutRef = useRef<number | null>(null)
  const lastRefreshRef = useRef(0)

  useEffect(() => {
    if (!resolved || !role) return

    const scheduleLogout = () => {
      if (logoutTimeoutRef.current) {
        window.clearTimeout(logoutTimeoutRef.current)
      }

      const current = readTrainerAccess()
      const remaining = Math.max(0, current.sessionUntil - Date.now())
      logoutTimeoutRef.current = window.setTimeout(async () => {
        await clearTrainerAccessSession()
        if (pathname.startsWith("/trainer") || pathname.startsWith("/verwaltung")) {
          router.push("/trainer-zugang")
          router.refresh()
        }
      }, remaining)
    }

    const refreshServerSession = async () => {
      const now = Date.now()
      if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return
      lastRefreshRef.current = now

      try {
        const response = await fetch("/api/trainer-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })

        if (!response.ok) {
          if (response.status === 401) {
            await clearTrainerAccessSession()
            if (pathname.startsWith("/trainer") || pathname.startsWith("/verwaltung")) {
              router.push("/trainer-zugang")
              router.refresh()
            }
          }
          return
        }

        const payload = (await response.json()) as {
          role: "admin" | "trainer"
          accountRole: "admin" | "trainer"
          linkedMemberId: string | null
          accountEmail: string
          accountFirstName: string
          accountLastName: string
          sessionUntil: number
        }

        persistTrainerAccess(payload.role, payload.sessionUntil, payload.accountRole, payload.linkedMemberId, {
          email: payload.accountEmail,
          firstName: payload.accountFirstName,
          lastName: payload.accountLastName,
        })
        scheduleLogout()
      } catch (error) {
        console.error("trainer session refresh failed", error)
      }
    }

    const registerActivity = () => {
      const current = readTrainerAccess()
      if (!current.role) return

      persistTrainerAccess(current.role, Date.now() + TRAINER_SESSION_MAX_AGE_MS, current.accountRole, current.linkedMemberId, {
        email: current.accountEmail,
        firstName: current.accountFirstName,
        lastName: current.accountLastName,
      })
      void refreshServerSession()
      scheduleLogout()
    }

    scheduleLogout()

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, registerActivity, { passive: true })
    }
    document.addEventListener("visibilitychange", registerActivity)

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, registerActivity)
      }
      document.removeEventListener("visibilitychange", registerActivity)
      if (logoutTimeoutRef.current) {
        window.clearTimeout(logoutTimeoutRef.current)
      }
    }
  }, [resolved, role, accountRole, linkedMemberId, accountEmail, pathname, router])

  return null
}
