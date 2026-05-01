"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { ResolvedUserContext } from "@/lib/resolveUserContext"

type Props = {
  user: ResolvedUserContext
}

const headerStyle = {
  background: "linear-gradient(90deg, #0b2a4a 0%, #133a63 100%)",
  color: "#fff",
  paddingTop: "max(16px, calc(16px + env(safe-area-inset-top)))",
  paddingRight: "16px",
  paddingBottom: "16px",
  paddingLeft: "16px",
  display: "grid",
  gridTemplateRows: "auto auto",
  alignItems: "center",
  justifyItems: "stretch",
  position: "sticky" as const,
  top: 0,
  zIndex: 50,
  boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
}

function navLinkStyle(active: boolean) {
  return {
    color: "white",
    textDecoration: "none",
    fontWeight: 500,
    paddingBottom: 6,
    borderBottom: active ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent",
    opacity: active ? 1 : 0.8,
    transition: "all 0.2s ease",
  } as const
}

export function HeaderClient({ user }: Props) {
  const pathname = usePathname() ?? ""
  const router = useRouter()

  const { isLoggedIn, isMember, isTrainer, isAdmin } = user

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    })

    router.replace("/")
    router.refresh()
  }

  return (
    <div style={headerStyle} className="sticky top-0 z-50 relative">
      {/* TOP ROW */}
      <div className="flex flex-row items-center justify-between flex-nowrap min-h-14 px-4">
        {/* LEFT: LOGO */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <img
            src="/brand/tsv-boxgym-logo-v2.png"
            alt="TSV BoxGym"
            style={{ height: 48, maxHeight: 40, width: "auto", objectFit: "contain" }}
          />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>TSV Falkensee</span>
            <span style={{ fontWeight: 700, fontSize: 14, opacity: 0.9, whiteSpace: "nowrap" }}>BoxGym</span>
          </div>
        </div>

        {!isLoggedIn && (
          <Link href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
            <button
              className="h-9 px-3 rounded-lg flex items-center justify-center text-sm bg-red-600 hover:bg-red-700 transition whitespace-nowrap"
              type="button"
            >
              Startseite
            </button>
          </Link>
        )}
      </div>

      {/* RIGHT: ROLE-BASED NAV */}
      <div
        className="flex items-center gap-2 flex-wrap md:absolute md:right-4 md:top-1/2 md:-translate-y-1/2 sm:justify-end"
        style={{ pointerEvents: "auto" }}
      >
        {isMember && (
          <Link
            href="/mein-bereich/dashboard"
            className="h-9 px-3 rounded-lg flex items-center justify-center text-sm bg-white/20 text-white hover:bg-white/30 transition whitespace-nowrap"
            style={{ textDecoration: "none" }}
          >
            Dashboard
          </Link>
        )}

        {isTrainer && (
          <Link
            href="/trainer"
            className="h-9 px-3 rounded-lg flex items-center justify-center text-sm bg-white/20 text-white hover:bg-white/30 transition whitespace-nowrap"
            style={{ textDecoration: "none" }}
          >
            Trainer
          </Link>
        )}

        {isAdmin && (
          <Link
            href="/verwaltung-neu"
            className="h-9 px-3 rounded-lg flex items-center justify-center text-sm bg-white/20 text-white hover:bg-white/30 transition whitespace-nowrap"
            style={{ textDecoration: "none" }}
          >
            Verwaltung
          </Link>
        )}

        {isLoggedIn && (
          <button
            className="h-9 px-3 rounded-lg flex items-center justify-center text-sm bg-red-600 hover:bg-red-700 transition whitespace-nowrap"
            style={{ border: "none", outline: "none", cursor: "pointer" }}
            type="button"
            onClick={() => void handleLogout()}
          >
            Logout
          </button>
        )}
      </div>

      {/* MEMBER AREA SUB-NAV */}
      {isMember && (pathname === "/mein-bereich" || pathname.startsWith("/mein-bereich/")) && (
        <div style={{ width: "100%", marginTop: 16, display: "flex", gap: 20, fontSize: 14, alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href="/mein-bereich/dashboard"
            style={navLinkStyle(
              pathname === "/mein-bereich" ||
                pathname === "/mein-bereich/dashboard" ||
                pathname.startsWith("/mein-bereich/dashboard"),
            )}
          >
            Dashboard
          </Link>
          <Link
            href="/mein-bereich/einstellungen"
            className="text-sm font-medium"
            style={navLinkStyle(
              pathname === "/mein-bereich/einstellungen" || pathname.startsWith("/mein-bereich/einstellungen"),
            )}
          >
            Einstellungen
          </Link>
        </div>
      )}

      {/* VERWALTUNG SUB-NAV */}
      {(pathname === "/verwaltung-neu" || pathname.startsWith("/verwaltung-neu/")) && (
        <div style={{ width: "100%", marginTop: 16, display: "flex", gap: 20, fontSize: 14, alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href="/verwaltung-neu"
            style={navLinkStyle(pathname === "/verwaltung-neu" || pathname === "/verwaltung-neu/")}
          >
            Dashboard
          </Link>
          <Link
            href="/verwaltung-neu/freigaben"
            style={navLinkStyle(
              pathname === "/verwaltung-neu/freigaben" || pathname.startsWith("/verwaltung-neu/freigaben"),
            )}
          >
            Freigaben
          </Link>
          <Link
            href="/verwaltung-neu/probemitglieder"
            style={navLinkStyle(
              pathname === "/verwaltung-neu/probemitglieder" || pathname.startsWith("/verwaltung-neu/probemitglieder"),
            )}
          >
            Probemitglieder
          </Link>
          <Link
            href="/verwaltung-neu/mitglieder"
            style={navLinkStyle(
              pathname === "/verwaltung-neu/mitglieder" || pathname.startsWith("/verwaltung-neu/mitglieder"),
            )}
          >
            Mitglieder
          </Link>
          <Link
            href="/verwaltung-neu/trainer"
            style={navLinkStyle(
              pathname === "/verwaltung-neu/trainer" || pathname.startsWith("/verwaltung-neu/trainer"),
            )}
          >
            Trainer
          </Link>
          <Link
            href="/verwaltung-neu/qr-code"
            style={navLinkStyle(
              pathname === "/verwaltung-neu/qr-code" || pathname.startsWith("/verwaltung-neu/qr-code"),
            )}
          >
            QR Code
          </Link>
          <Link
            href="/verwaltung-neu/gs-abgleich"
            style={navLinkStyle(
              pathname === "/verwaltung-neu/gs-abgleich" || pathname.startsWith("/verwaltung-neu/gs-abgleich"),
            )}
          >
            GS-Abgleich
          </Link>
          <Link
            href="/verwaltung-neu/tools"
            style={navLinkStyle(
              pathname === "/verwaltung-neu/tools" || pathname.startsWith("/verwaltung-neu/tools"),
            )}
          >
            Tools
          </Link>
          <Link
            href="/verwaltung-neu/qr-scanner"
            style={navLinkStyle(
              pathname === "/verwaltung-neu/qr-scanner" || pathname.startsWith("/verwaltung-neu/qr-scanner"),
            )}
          >
            QR-Scanner
          </Link>
          <Link
            href="/verwaltung-neu/rollen"
            style={navLinkStyle(
              pathname === "/verwaltung-neu/rollen" || pathname.startsWith("/verwaltung-neu/rollen"),
            )}
          >
            Rollen &amp; Rechte
          </Link>
        </div>
      )}
    </div>
  )
}
