"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"

export default function MemberPasswordUpdateGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const requestedPathsRef = useRef<Set<string>>(new Set())
  const activeRequestControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!pathname) return
    if (requestedPathsRef.current.has(pathname)) return

    requestedPathsRef.current.add(pathname)
    let cancelled = false
    const controller = new AbortController()
    activeRequestControllerRef.current = controller

    const checkSession = async () => {
      try {
        const response = await fetch("/api/public/member-area", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ action: "member_session", summaryOnly: true }),
        })

        const data = await response.json().catch(() => null)
        if (cancelled || !data) return

        const isPasswordChangePath = pathname === "/mein-bereich/passwort-aendern"
        const needsPasswordUpdate = data?.ok === true && data?.needsPasswordUpdate === true
        const isSessionExpired = data?.code === "session_expired"

        if (response.status === 401 && isPasswordChangePath) {
          router.replace(isSessionExpired ? "/mein-bereich/login?reason=session_expired" : "/mein-bereich/login")
          return
        }

        if (needsPasswordUpdate && !isPasswordChangePath) {
          router.replace("/mein-bereich/passwort-aendern")
          return
        }

        if (!needsPasswordUpdate && data?.ok === true && isPasswordChangePath) {
          router.replace("/mein-bereich")
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
        // Ignore transient fetch errors and keep current route.
      }
    }

    void checkSession()

    return () => {
      cancelled = true
      controller.abort()
      if (activeRequestControllerRef.current === controller) {
        activeRequestControllerRef.current = null
      }
    }
  }, [pathname, router])

  return <>{children}</>
}
