"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

type SessionCheckResponse = {
  status: number
  data: unknown
}

const inflightSessionChecksByPath = new Map<string, Promise<SessionCheckResponse>>()
const recentSessionChecksByPath = new Map<string, { at: number; result: SessionCheckResponse }>()
const SESSION_CHECK_RESULT_TTL_MS = 1200

async function runMemberSessionSummaryCheck(pathname: string): Promise<SessionCheckResponse> {
  const now = Date.now()
  const recent = recentSessionChecksByPath.get(pathname)

  if (recent && now - recent.at < SESSION_CHECK_RESULT_TTL_MS) {
    return recent.result
  }

  const inflight = inflightSessionChecksByPath.get(pathname)
  if (inflight) {
    return inflight
  }

  const promise = (async () => {
    const response = await fetch("/api/public/member-area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "member_session", summaryOnly: true }),
    })

    const data = await response.json().catch(() => null)
    const result: SessionCheckResponse = {
      status: response.status,
      data,
    }

    recentSessionChecksByPath.set(pathname, { at: Date.now(), result })
    return result
  })()

  inflightSessionChecksByPath.set(pathname, promise)
  return promise.finally(() => {
    inflightSessionChecksByPath.delete(pathname)
  })
}

export default function MemberPasswordUpdateGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!pathname) return
    let cancelled = false

    const checkSession = async () => {
      try {
        const { status, data } = await runMemberSessionSummaryCheck(pathname)
        if (cancelled || !data) return

        const isPasswordChangePath = pathname === "/mein-bereich/passwort-aendern"
        const payload = data as { ok?: boolean; needsPasswordUpdate?: boolean; code?: string }
        const needsPasswordUpdate = payload.ok === true && payload.needsPasswordUpdate === true
        const isSessionExpired = payload.code === "session_expired"

        if (status === 401 && isPasswordChangePath) {
          router.replace(isSessionExpired ? "/mein-bereich/login?reason=session_expired" : "/mein-bereich/login")
          return
        }

        if (needsPasswordUpdate && !isPasswordChangePath) {
          router.replace("/mein-bereich/passwort-aendern")
          return
        }

        if (!needsPasswordUpdate && payload.ok === true && isPasswordChangePath) {
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
