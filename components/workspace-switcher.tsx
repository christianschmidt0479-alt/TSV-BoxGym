"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ShieldCheck, UserCircle2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { persistTrainerAccess, readTrainerAccess } from "@/lib/trainerAccess"
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

  const currentWorkspace = getWorkspace(pathname)
  const hasTrainerAccess = Boolean(role)
  const hasAdminAccess = accountRole === "admin"
  const sportlerHref = linkedMemberId ? "/mein-bereich?trainer_access=1" : "/mein-bereich"

  function switchWorkspace(nextWorkspace: "trainer" | "admin") {
    if (typeof window === "undefined") return

    const currentAccess = readTrainerAccess()
    if (!currentAccess.sessionUntil || currentAccess.sessionUntil <= Date.now()) return

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

    router.push(nextWorkspace === "admin" ? "/verwaltung" : "/trainer")
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
            type="button"
            size="sm"
            variant={currentWorkspace === "trainer" ? "default" : "outline"}
            className={`rounded-xl ${currentWorkspace === "trainer" ? "bg-[#154c83] text-white hover:bg-[#123d69]" : ""}`}
            disabled={!resolved || !hasTrainerAccess}
            onClick={() => switchWorkspace("trainer")}
          >
            <Users className="mr-2 h-4 w-4" />
            Trainer
          </Button>

          <Button
            type="button"
            size="sm"
            variant={currentWorkspace === "admin" ? "default" : "outline"}
            className={`rounded-xl ${currentWorkspace === "admin" ? "bg-[#0f4f8c] text-white hover:bg-[#0c406f]" : ""}`}
            disabled={!resolved || !hasAdminAccess}
            onClick={() => switchWorkspace("admin")}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Admin
          </Button>
        </div>
      </div>
    </div>
  )
}
