"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { LogOut, ShieldCheck, UserCircle2, Users } from "lucide-react"
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
  const router = useRouter()
  const { resolved, role, accountRole, linkedMemberId } = useTrainerAccess()
  const [logoutPending, setLogoutPending] = useState(false)
  const [hasMemberSession, setHasMemberSession] = useState(false)
  const [hasParentSession, setHasParentSession] = useState(false)

  const currentWorkspace = getWorkspace(pathname)
  const hasTrainerAccess = Boolean(role)
  const hasAdminAccess = accountRole === "admin"
  const sportlerHref = linkedMemberId ? "/mein-bereich?trainer_access=1" : "/mein-bereich"
  const showLogoutButton = hasTrainerAccess || hasMemberSession || hasParentSession

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

  async function handleLogout() {
    try {
      setLogoutPending(true)

      await Promise.allSettled([
        clearTrainerAccessSession({ logErrors: false }),
        fetch("/api/public/member-area", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout_member_session" }),
        }),
        fetch("/api/public/member-area", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout_parent_session" }),
        }),
      ])

      if (typeof window !== "undefined") {
        window.localStorage.removeItem("tsv_member_area_email")
        window.localStorage.removeItem("tsv_parent_area_email")
        window.localStorage.removeItem("tsv_parent_area_first_name")
        window.localStorage.removeItem("tsv_parent_area_last_name")
      }

      router.replace("/")
      router.refresh()
    } finally {
      setLogoutPending(false)
    }
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
            className={`rounded-xl ${currentWorkspace === "admin" ? "bg-[#0f4f8c] text-white hover:bg-[#0c406f]" : ""}`}
            disabled={!resolved || !hasAdminAccess}
          >
            <Link href="/verwaltung" onClick={() => persistWorkspace("admin")}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Admin
            </Link>
          </Button>

          {showLogoutButton ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={logoutPending}
              onClick={() => void handleLogout()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {logoutPending ? "Loggt aus..." : "Ausloggen"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
