"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

export default function MemberPasswordUpdateGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    const checkSession = async () => {
      try {
        const response = await fetch("/api/public/member-area", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "member_session" }),
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
      } catch {
        // Ignore transient fetch errors and keep current route.
      }
    }

    void checkSession()

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  return <>{children}</>
}
