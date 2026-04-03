"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { clearTrainerAccess, clearTrainerAccessSession, persistTrainerAccess, readTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart"]
const REFRESH_THROTTLE_MS = 60 * 1000

function isProtectedTrainerPath(pathname: string) {
  return pathname.startsWith("/trainer") || pathname.startsWith("/verwaltung")
}

export function TrainerSessionGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const { resolved, role, accountRole, linkedMemberId, accountEmail, accountFirstName, accountLastName } = useTrainerAccess()
  const logoutTimeoutRef = useRef<number | null>(null)
  const lastRefreshRef = useRef(0)
  const restoreAttemptRef = useRef(false)

  useEffect(() => {
    if (!resolved) return
    if (!isProtectedTrainerPath(pathname)) return
    if (role) {
      restoreAttemptRef.current = false
      return
    }
    if (restoreAttemptRef.current) return

    restoreAttemptRef.current = true

    void (async () => {
      try {
        const response = await fetch("/api/trainer-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })

        if (!response.ok) {
          clearTrainerAccess()
          router.replace("/trainer-zugang")
          router.refresh()
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
      } catch (error) {
        console.error("trainer session restore failed", error)
        clearTrainerAccess()
        router.replace("/trainer-zugang")
        router.refresh()
      }
    })()
  }, [pathname, resolved, role, router])

  useEffect(() => {
    if (!resolved || !role) return

    const scheduleLogout = () => {
      if (logoutTimeoutRef.current) {
        window.clearTimeout(logoutTimeoutRef.current)
      }

        const current = readTrainerAccess()
        const remaining = Math.max(0, current.sessionUntil - Date.now())
      logoutTimeoutRef.current = window.setTimeout(async () => {
        await clearTrainerAccessSession({ remote: false })
        if (isProtectedTrainerPath(pathname)) {
          router.replace("/trainer-zugang")
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
            await clearTrainerAccessSession({ remote: false })
            if (isProtectedTrainerPath(pathname)) {
              router.replace("/trainer-zugang")
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
  }, [resolved, role, accountRole, linkedMemberId, accountEmail, accountFirstName, accountLastName, pathname, router])

  return null
}
