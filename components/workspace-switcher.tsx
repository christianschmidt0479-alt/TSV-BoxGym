"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ShieldCheck, UserCircle2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clearTrainerAccessSession, persistTrainerAccess, readTrainerAccess } from "@/lib/trainerAccess"
import { useTrainerAccess } from "@/lib/useTrainerAccess"

function getWorkspace(pathname: string) {
  if (pathname.startsWith("/verwaltung")) return "admin"
  if (pathname.startsWith("/trainer")) return "trainer"
  if (pathname.startsWith("/mein-bereich")) return "sportler"
  return "sportler"
}

export function WorkspaceSwitcher() {
  const pathname = usePathname()
  const { resolved, role, accountRole, linkedMemberId } = useTrainerAccess()
  const [hasMemberSession, setHasMemberSession] = useState(false)
  const [hasParentSession, setHasParentSession] = useState(false)
  const [unreadEmailCount, setUnreadEmailCount] = useState(0)

  const currentWorkspace = getWorkspace(pathname ?? "")
  const hasTrainerAccess = Boolean(role)
  const hasAdminAccess = accountRole === "admin"
  const sportlerHref = linkedMemberId ? "/mein-bereich?trainer_access=1" : "/mein-bereich"

  useEffect(() => {
    let cancelled = false

    async function loadSessionState() {
      try {
        const [memberResponse, parentResponse] = await Promise.allSettled([
          fetch("/api/public/member-area", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "member_session" }),
          }),
          fetch("/api/public/member-area", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "parent_session" }),
          }),
        ])

        if (cancelled) return

        setHasMemberSession(memberResponse.status === "fulfilled" && memberResponse.value.ok)
        setHasParentSession(parentResponse.status === "fulfilled" && parentResponse.value.ok)
      } catch {
        if (cancelled) return
        setHasMemberSession(false)
        setHasParentSession(false)
      }
    }

    void loadSessionState()

    return () => {
      cancelled = true
    }
  }, [pathname])

  // Ungelesene E-Mails zählen (nur für Admins, jede Minute)
  useEffect(() => {
    if (!resolved || !hasAdminAccess) return

    async function fetchUnreadCount() {
      try {
        const since = localStorage.getItem("tsv_admin_emails_viewed_at") ?? new Date().toISOString()
        const response = await fetch(
          `/api/admin/inbound-emails/unread-count?since=${encodeURIComponent(since)}`,
          { cache: "no-store" },
        )
        if (response.ok) {
          const payload = (await response.json()) as { ok?: boolean; count?: number }
          if (payload.ok) {
            setUnreadEmailCount(payload.count ?? 0)
          }
        }
      } catch {
        // Stille Fehler – Badge bleibt unverändert
      }
    }

    void fetchUnreadCount()
    const interval = setInterval(() => void fetchUnreadCount(), 60 * 1000)
    return () => clearInterval(interval)
  }, [resolved, hasAdminAccess])

  function persistWorkspace(nextWorkspace: "trainer" | "admin") {
    if (typeof window === "undefined") return

    const currentAccess = readTrainerAccess()
    if (!currentAccess.sessionUntil) return

    persistTrainerAccess(
      nextWorkspace === "admin" ? "admin" : "trainer",
      currentAccess.sessionUntil,
      currentAccess.accountRole,
      currentAccess.linkedMemberId,
      {
        email: currentAccess.accountEmail,
        firstName: currentAccess.accountFirstName,
        lastName: currentAccess.accountLastName,
      }
    )
  }

  return (
    <div className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 md:px-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Bereich
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            size="sm"
            variant={currentWorkspace === "sportler" ? "default" : "outline"}
            className={`rounded-xl ${currentWorkspace === "sportler" ? "bg-zinc-900 text-white hover:bg-zinc-800" : ""}`}
          >
            <Link href={sportlerHref}>
              <UserCircle2 className="mr-2 h-4 w-4" />
              Sportler
            </Link>
          </Button>

          <Button
            asChild
            size="sm"
            variant={currentWorkspace === "trainer" ? "default" : "outline"}
            className={`rounded-xl ${currentWorkspace === "trainer" ? "bg-[#154c83] text-white hover:bg-[#123d69]" : ""}`}
            disabled={!resolved || !hasTrainerAccess}
          >
            <Link href="/trainer" onClick={() => persistWorkspace("trainer")}>
              <Users className="mr-2 h-4 w-4" />
              Trainer
            </Link>
          </Button>

          <Button
            asChild
            size="sm"
            variant={currentWorkspace === "admin" ? "default" : "outline"}
            className={`relative rounded-xl ${currentWorkspace === "admin" ? "bg-[#0f4f8c] text-white hover:bg-[#0c406f]" : ""}`}
            disabled={!resolved || !hasAdminAccess}
          >
            <Link href="/verwaltung" onClick={() => persistWorkspace("admin")}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Admin
              {unreadEmailCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadEmailCount > 99 ? "99+" : unreadEmailCount}
                </span>
              )}
            </Link>
          </Button>

        </div>
      </div>
    </div>
  )
}
