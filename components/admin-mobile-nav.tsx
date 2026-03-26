"use client"

import Link from "next/link"
import { useState } from "react"
import { usePathname } from "next/navigation"
import { ChevronDown, Menu, X } from "lucide-react"

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

export function AdminMobileNav({ sections }: AdminMobileNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [openSection, setOpenSection] = useState<string>(sections[0]?.title ?? "")
  const safeOpenSection = sections.some((section) => section.title === openSection) ? openSection : (sections[0]?.title ?? "")

  return (
    <div className="md:hidden">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-2xl border border-[#b9cde2] bg-[#eef4fb] px-3.5 py-2 text-sm font-semibold text-[#154c83] transition hover:border-[#154c83] hover:bg-white"
        aria-expanded={open}
        aria-controls="admin-mobile-menu"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        Menü
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Menü schließen"
            className="fixed inset-0 z-30 bg-[#0f2740]/20"
            onClick={() => setOpen(false)}
          />
          <div
            id="admin-mobile-menu"
            className="absolute inset-x-4 top-full z-40 mt-3 overflow-hidden rounded-[24px] border border-[#d8e3ee] bg-white shadow-[0_18px_48px_rgba(15,39,64,0.18)]"
          >
            <div className="border-b border-[#e2e8f0] px-4 py-3 text-sm font-semibold text-[#154c83]">Admin-Menü</div>
            <div className="max-h-[70vh] overflow-y-auto p-3">
              <div className="space-y-2">
                {sections.map((section) => {
                  const expanded = safeOpenSection === section.title
                  return (
                    <div key={section.title} className="overflow-hidden rounded-2xl border border-[#d8e3ee] bg-[#f7fbff]">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-[#154c83]"
                        aria-expanded={expanded}
                        onClick={() => setOpenSection(expanded ? "" : section.title)}
                      >
                        <span>{section.title}</span>
                        <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
                      </button>
                      {expanded ? (
                        <div className="grid gap-2 border-t border-[#d8e3ee] px-3 py-3">
                          {section.items.map((item) => {
                            const active = pathname === item.href
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className={`rounded-2xl px-3.5 py-2 text-sm font-semibold transition ${
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
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
