"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { ChevronDown } from "lucide-react"
import type { NavBadgesResponse } from "@/app/api/admin/nav-badges/route"

// ─── Badge-Komponente ─────────────────────────────────────────────────────────

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-1 inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  )
}

// ─── Menüstruktur ─────────────────────────────────────────────────────────────

type MenuItem = { label: string; href: string; badgeKey?: string }
type MenuSection = { id: string; label: string; badgeSectionKey?: string; items: MenuItem[] }

function buildMenu(isAdmin: boolean): MenuSection[] {
  return [
    {
      id: "uebersicht",
      label: "Übersicht",
      items: [
        { label: "Start", href: "/verwaltung" },
        { label: "Heute", href: "/verwaltung/heute" },
      ],
    },
    {
      id: "freigaben",
      label: "Freigaben",
      items: [
        { label: "Freigaben", href: "/verwaltung/freigaben", badgeKey: "freigaben" },
      ],
    },
    {
      id: "mitglieder",
      label: "Mitglieder",
      badgeSectionKey: "mitglieder",
      items: [
        { label: "Mitglieder", href: "/verwaltung/mitglieder" },
        ...(isAdmin ? [{ label: "Trainer", href: "/verwaltung/trainer" }] : []),
        ...(isAdmin ? [{ label: "Rollen", href: "/verwaltung/personen" }] : []),
        ...(isAdmin ? [{ label: "Geburtstage", href: "/verwaltung/geburtstage" }] : []),
      ],
    },
    {
      id: "training",
      label: "Training",
      items: [
        { label: "Check-ins", href: "/verwaltung/checkins" },
        { label: "Gruppen", href: "/verwaltung/gruppen" },
        { label: "Wettkampf", href: "/verwaltung/wettkampf" },
        { label: "QR-Codes", href: "/verwaltung/qr-codes" },
      ],
    },
    {
      id: "kommunikation",
      label: "Kommunikation",
      items: [
        { label: "Postfach", href: "/verwaltung/postfach", badgeKey: "postfach" },
      ],
    },
    {
      id: "tools",
      label: "Tools",
      items: [
        { label: "Excel-Abgleich", href: "/verwaltung/excel-abgleich" },
        ...(isAdmin ? [{ label: "Trainingsplanung", href: "/verwaltung/trainingsplanung" }] : []),
        ...(isAdmin ? [{ label: "Vorlagenbibliothek", href: "/verwaltung/trainingsplanung/vorlagen" }] : []),
        ...(isAdmin ? [{ label: "KI-Basisprofil", href: "/verwaltung/trainingsplanung/ki-basisprofil" }] : []),
      ],
    },
    {
      id: "system",
      label: "System",
      badgeSectionKey: "system",
      items: [
        ...(isAdmin ? [{ label: "Sicherheit", href: "/verwaltung/sicherheit", badgeKey: "sicherheit" }] : []),
        ...(isAdmin ? [{ label: "Einstellungen", href: "/verwaltung/einstellungen" }] : []),
        ...(isAdmin ? [{ label: "KI", href: "/verwaltung/ki" }] : []),
        ...(isAdmin ? [{ label: "Fehler", href: "/verwaltung/fehler", badgeKey: "fehler" }] : []),
      ],
    },
  ]
}

// ─── Badge-Helper ─────────────────────────────────────────────────────────────

function getSectionTotal(badges: NavBadgesResponse | null, sectionKey: string | undefined): number {
  if (!badges || !sectionKey) return 0
  const section = badges[sectionKey as keyof NavBadgesResponse]
  return section?.total ?? 0
}

function getItemBadge(badges: NavBadgesResponse | null, sectionKey: string | undefined, itemKey: string | undefined): number {
  if (!badges || !sectionKey || !itemKey) return 0
  const section = badges[sectionKey as keyof NavBadgesResponse]
  if (!section) return 0
  return (section.items as Record<string, number>)[itemKey] ?? 0
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function AdminTopNav({ isAdmin }: { isAdmin: boolean }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [badges, setBadges] = useState<NavBadgesResponse | null>(null)
  const [badgesTick, setBadgesTick] = useState(0)
  const pathname = usePathname()
  const navRef = useRef<HTMLDivElement>(null)
  const menu = buildMenu(isAdmin)

  // Manueller Badge-Refresh nach Seen-Call (Event kommt von useMarkSectionSeen)
  useEffect(() => {
    function onRefresh() { setBadgesTick((t) => t + 1) }
    window.addEventListener("admin-nav-badges-refresh", onRefresh)
    return () => window.removeEventListener("admin-nav-badges-refresh", onRefresh)
  }, [])

  // Badges laden — initial + bei Routenwechsel + nach manuellem Refresh
  useEffect(() => {
    let cancelled = false
    async function loadBadges() {
      try {
        const response = await fetch("/api/admin/nav-badges", { cache: "no-store" })
        if (!response.ok || cancelled) return
        const data = (await response.json()) as NavBadgesResponse
        if (!cancelled) setBadges(data)
      } catch {
        // still fail: badges bleiben null → keine Anzeige
      }
    }
    void loadBadges()
    return () => { cancelled = true }
  }, [pathname, badgesTick])

  // ESC schließt Menü
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(null)
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [])

  // Klick außerhalb schließt Menü
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    if (openMenu) {
      document.addEventListener("mousedown", handleClick)
    }
    return () => document.removeEventListener("mousedown", handleClick)
  }, [openMenu])

  function isSectionActive(section: MenuSection) {
    return section.items.some(
      (item) =>
        pathname === item.href ||
        (item.href !== "/verwaltung" && pathname.startsWith(item.href + "/"))
    )
  }

  return (
    <div ref={navRef} className="flex flex-wrap gap-1.5">
      {menu.map((section, index) => {
        const active = isSectionActive(section)
        const isOpen = openMenu === section.id
        const alignRight = index >= menu.length - 2
        const sectionBadge = getSectionTotal(badges, section.badgeSectionKey)
        return (
          <div key={section.id} className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(isOpen ? null : section.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition ${
                active || isOpen
                  ? "bg-[#154c83] text-white"
                  : "bg-[#eef4fb] text-[#154c83] hover:bg-[#dfeaf7]"
              }`}
            >
              {section.label}
              {sectionBadge > 0 && (
                <span className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${active || isOpen ? "bg-white text-red-600" : "bg-red-600 text-white"}`}>
                  {sectionBadge > 99 ? "99+" : sectionBadge}
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isOpen && (
              <>
                <div
                  className="fixed inset-0 z-30 bg-black/5"
                  onClick={() => setOpenMenu(null)}
                />
                <div className={`absolute ${alignRight ? "right-0" : "left-0"} top-full z-40 mt-1.5 min-w-[160px] max-w-[240px] rounded-xl border border-[#d8e3ee] bg-white p-1.5 shadow-lg`}>
                  <div className="grid grid-cols-1 gap-0.5">
                    {section.items.map((item) => {
                      const itemActive =
                        pathname === item.href ||
                        (item.href !== "/verwaltung" &&
                          pathname.startsWith(item.href + "/"))
                      const itemBadge = getItemBadge(badges, section.badgeSectionKey, item.badgeKey)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpenMenu(null)}
                          className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition hover:bg-[#eef4fb] ${
                            itemActive
                              ? "bg-[#eef4fb] font-semibold text-[#154c83]"
                              : "text-zinc-700"
                          }`}
                        >
                          <span>{item.label}</span>
                          {itemBadge > 0 && (
                            <span className="ml-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                              {itemBadge > 99 ? "99+" : itemBadge}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

