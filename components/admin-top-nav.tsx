"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { ChevronDown } from "lucide-react"

type MenuItem = { label: string; href: string }
type MenuSection = { id: string; label: string; items: MenuItem[] }

function buildMenu(isAdmin: boolean): MenuSection[] {
  return [
    {
      id: "uebersicht",
      label: "Übersicht",
      items: [
        { label: "Inbox", href: "/verwaltung/inbox" },
        { label: "Heute", href: "/verwaltung/heute" },
        { label: "Start", href: "/verwaltung" },
      ],
    },
    {
      id: "mitglieder",
      label: "Mitglieder",
      items: [
        { label: "Freigaben", href: "/verwaltung/freigaben" },
        { label: "Mitglieder", href: "/verwaltung/mitglieder" },
        { label: "QR-Codes", href: "/verwaltung/qr-codes" },
        ...(isAdmin ? [{ label: "Geburtstage", href: "/verwaltung/geburtstage" }] : []),
        ...(isAdmin ? [{ label: "Rollen", href: "/verwaltung/personen" }] : []),
      ],
    },
    {
      id: "training",
      label: "Training",
      items: [
        { label: "Check-ins", href: "/verwaltung/checkins" },
        { label: "Gruppen", href: "/verwaltung/gruppen" },
        { label: "Wettkampf", href: "/verwaltung/wettkampf" },
        { label: "Abgleich", href: "/verwaltung/excel-abgleich" },
      ],
    },
    {
      id: "verwaltung",
      label: "Verwaltung",
      items: [
        { label: "Postfach", href: "/verwaltung/postfach" },
        { label: "Mail", href: "/verwaltung/mail" },
        ...(isAdmin ? [{ label: "Trainer", href: "/verwaltung/trainer" }] : []),
        ...(isAdmin ? [{ label: "Einstellungen", href: "/verwaltung/einstellungen" }] : []),
      ],
    },
    ...(isAdmin
      ? [
          {
            id: "system",
            label: "System",
            items: [
              { label: "KI", href: "/verwaltung/ki" },
              { label: "Sicherheit", href: "/verwaltung/sicherheit" },
            ],
          },
        ]
      : []),
  ]
}

export function AdminTopNav({ isAdmin }: { isAdmin: boolean }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const pathname = usePathname()
  const navRef = useRef<HTMLDivElement>(null)
  const menu = buildMenu(isAdmin)

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
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpenMenu(null)}
                          className={`rounded-lg px-3 py-2.5 text-sm transition hover:bg-[#eef4fb] ${
                            itemActive
                              ? "bg-[#eef4fb] font-semibold text-[#154c83]"
                              : "text-zinc-700"
                          }`}
                        >
                          {item.label}
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
