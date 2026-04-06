"use client"

import Link from "next/link"
import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { ChevronDown, Menu, X } from "lucide-react"
import type { NavBadgesResponse } from "@/app/api/admin/nav-badges/route"

type NavItem = {
  href: string
  label: string
}

type NavSection = {
  title: string
  items: NavItem[]
}

type AdminMobileNavProps = {
  sections: NavSection[]
}

function getSectionBadge(badges: NavBadgesResponse | null, title: string): number {
  if (!badges) return 0
  if (title === "Mitglieder") return badges.mitglieder.total
  if (title === "System") return badges.verwaltung.total + badges.system.total
  return 0
}

function getItemBadge(badges: NavBadgesResponse | null, href: string): number {
  if (!badges) return 0
  if (href === "/verwaltung/freigaben") return badges.mitglieder.items.freigaben
  if (href === "/verwaltung/postfach") return badges.verwaltung.items.postfach
  if (href === "/verwaltung/sicherheit") return badges.system.items.sicherheit
  if (href === "/verwaltung/fehler") return badges.system.items.fehler
  return 0
}

export function AdminMobileNav({ sections }: AdminMobileNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [menuTop, setMenuTop] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [openSection, setOpenSection] = useState<string>(sections[0]?.title ?? "")
  const [badges, setBadges] = useState<NavBadgesResponse | null>(null)
  const [badgesTick, setBadgesTick] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const safeOpenSection = sections.some((section) => section.title === openSection) ? openSection : (sections[0]?.title ?? "")

  useEffect(() => {
    setMounted(true)
  }, [])

  // Manueller Badge-Refresh nach Seen-Call (Event kommt von useMarkSectionSeen)
  useEffect(() => {
    function onRefresh() { setBadgesTick((t) => t + 1) }
    window.addEventListener("admin-nav-badges-refresh", onRefresh)
    return () => window.removeEventListener("admin-nav-badges-refresh", onRefresh)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadBadges() {
      try {
        const response = await fetch("/api/admin/nav-badges", { cache: "no-store" })
        if (!response.ok) return
        const data = await response.json() as NavBadgesResponse
        if (!cancelled) setBadges(data)
      } catch {
        // Badge-Fehler still ignorieren
      }
    }
    void loadBadges()
    return () => { cancelled = true }
  }, [pathname, badgesTick])

  function handleOpenToggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuTop(rect.bottom + 8)
    }
    setOpen((v) => !v)
  }

  const menuPortal =
    mounted && open
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="Menü schließen"
              className="fixed inset-0 z-[200] bg-[#0f2740]/20"
              onClick={() => setOpen(false)}
            />
            <div
              id="admin-mobile-menu"
              style={{ top: menuTop }}
              className="fixed inset-x-4 z-[201] overflow-hidden rounded-[24px] border border-[#d8e3ee] bg-white shadow-[0_18px_48px_rgba(15,39,64,0.18)]"
            >
              <div className="border-b border-[#e2e8f0] px-4 py-3 text-sm font-semibold text-[#154c83]">Admin-Menü</div>
              <div className="max-h-[70vh] overflow-y-auto p-3">
                <div className="space-y-2">
                  {sections.map((section) => {
                    const expanded = safeOpenSection === section.title
                    const sectionBadge = getSectionBadge(badges, section.title)
                    return (
                      <div key={section.title} className="overflow-hidden rounded-2xl border border-[#d8e3ee] bg-[#f7fbff]">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-[#154c83]"
                          aria-expanded={expanded}
                          onClick={() => setOpenSection(expanded ? "" : section.title)}
                        >
                          <span className="flex items-center gap-2">
                            {section.title}
                            {sectionBadge > 0 && (
                              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                                {sectionBadge > 99 ? "99+" : sectionBadge}
                              </span>
                            )}
                          </span>
                          <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
                        </button>
                        {expanded ? (
                          <div className="grid gap-2 border-t border-[#d8e3ee] px-3 py-3">
                            {section.items
                              .filter((item) =>
                                item.href !== "/verwaltung/mail" &&
                                item.href !== "/verwaltung/mail/verfassen" &&
                                item.href !== "/verwaltung/inbox"
                              )
                              .map((item) => {
                                const active = pathname === item.href
                                const itemBadge = getItemBadge(badges, item.href)
                                return (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setOpen(false)}
                                    className={`flex items-center justify-between rounded-2xl px-3.5 py-2 text-sm font-semibold transition ${
                                      active
                                        ? "border border-[#154c83] bg-[#154c83] text-white"
                                        : "border border-[#b9cde2] bg-white text-[#154c83] hover:border-[#154c83] hover:bg-[#eef4fb]"
                                    }`}
                                  >
                                    <span>{item.label}</span>
                                    {itemBadge > 0 && (
                                      <span className={`ml-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${active ? "bg-white text-red-600" : "bg-red-600 text-white"}`}>
                                        {itemBadge > 99 ? "99+" : itemBadge}
                                      </span>
                                    )}
                                  </Link>
                                )
                              })}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )
      : null

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex items-center gap-2 rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-2 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-white"
        aria-expanded={open}
        aria-controls="admin-mobile-menu"
        onClick={handleOpenToggle}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        Menü
      </button>
      {menuPortal}
    </div>
  )
}
