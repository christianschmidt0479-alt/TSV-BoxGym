"use client"

import Link from "next/link"
import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"

type NavItem = {
  href: string
  label: string
}

type NavSection = {
  title: string
  items: NavItem[]
}

type TrainerMobileNavProps = {
  sections: NavSection[]
}

export function TrainerMobileNav({ sections }: TrainerMobileNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [menuTop, setMenuTop] = useState(0)
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Menü bei Routenwechsel schließen
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // ESC schließt Menü
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    if (open) document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open])

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
              id="trainer-mobile-menu"
              style={{ top: menuTop }}
              className="fixed inset-x-4 z-[201] overflow-hidden rounded-[24px] border border-[#d8e3ee] bg-white shadow-[0_18px_48px_rgba(15,39,64,0.18)]"
            >
              <div className="border-b border-[#e2e8f0] px-4 py-3 text-sm font-semibold text-[#154c83]">Trainer-Menü</div>
              <div className="max-h-[70vh] overflow-y-auto p-3">
                <div className="space-y-3">
                  {sections.map((section) => (
                    <div key={section.title}>
                      <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                        {section.title}
                      </div>
                      <div className="grid gap-1.5">
                        {section.items.map((item) => {
                          const active = pathname === item.href
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className={`flex items-center rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition ${
                                active
                                  ? "border border-[#154c83] bg-[#154c83] text-white"
                                  : "border border-[#b9cde2] bg-white text-[#154c83] hover:border-[#154c83] hover:bg-[#eef4fb]"
                              }`}
                            >
                              {item.label}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ))}
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
        aria-controls="trainer-mobile-menu"
        onClick={handleOpenToggle}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        Menü
      </button>
      {menuPortal}
    </div>
  )
}
