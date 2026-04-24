"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const header = {
  background: "linear-gradient(90deg, #0b2a4a 0%, #133a63 100%)",
  color: "#fff",
  padding: "20px 40px 14px 40px",
  display: "flex",
  flexDirection: "column" as const,
  boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
}

export default function Header() {
  const pathname = usePathname() ?? ""

  return (
    <div style={header}>
      {/* TOP ROW */}
      <div style={{
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        {/* LEFT: LOGO */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/logo.png"
            alt="TSV BoxGym"
            style={{
              height: 48,
              width: "auto",
              objectFit: "contain"
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              TSV Falkensee
            </span>
            <span style={{ fontWeight: 700, fontSize: 14, opacity: 0.9 }}>
              BoxGym
            </span>
          </div>
        </div>

        {/* RIGHT: NAVIGATION */}
        <div className="flex items-center gap-3">
          <Link
            href="/mein-bereich"
            className="h-9 px-3 rounded-lg flex items-center justify-center text-sm bg-white/20 text-white hover:bg-white/30 transition"
            style={{ textDecoration: "none" }}
          >
            Mein Bereich
          </Link>

          <Link
            href="/trainer"
            className="h-9 px-3 rounded-lg flex items-center justify-center text-sm bg-white/20 text-white hover:bg-white/30 transition"
            style={{ textDecoration: "none" }}
          >
            Training
          </Link>

          <Link
            href="/verwaltung-neu"
            className="h-9 px-3 rounded-lg flex items-center justify-center text-sm bg-white/20 text-white hover:bg-white/30 transition"
            style={{ textDecoration: "none" }}
          >
            Verwaltung
          </Link>

          <form
            action="/api/auth/logout"
            method="POST"
          >
            <button
              className="ml-4 px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition"
              style={{ border: "none", outline: "none", cursor: "pointer" }}
              type="submit"
            >
              Logout
            </button>
          </form>
        </div>
      </div>

      {/* NAVIGATION - ONLY FOR MEMBER AREA */}
      {(pathname === "/mein-bereich" || pathname.startsWith("/mein-bereich/")) && (
        <div style={{
          width: "100%",
          marginTop: 16,
          display: "flex",
          gap: 20,
          fontSize: 14
        }}>
          <Link href="/mein-bereich" style={{
            color: "white",
            textDecoration: "none",
            fontWeight: 500,
            paddingBottom: 6,
            borderBottom: pathname === "/mein-bereich" ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent",
            opacity: pathname === "/mein-bereich" ? 1 : 0.8,
            transition: "all 0.2s ease"
          }}>Dashboard</Link>
          <Link href="/mein-bereich/dashboard" style={{
            color: "white",
            textDecoration: "none",
            fontWeight: 500,
            paddingBottom: 6,
            borderBottom: pathname === "/mein-bereich/dashboard" || pathname.startsWith("/mein-bereich/dashboard") ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent",
            opacity: pathname === "/mein-bereich/dashboard" || pathname.startsWith("/mein-bereich/dashboard") ? 1 : 0.8,
            transition: "all 0.2s ease"
          }}>Status</Link>
          <Link href="/checkin" style={{
            color: "white",
            textDecoration: "none",
            fontWeight: 500,
            paddingBottom: 6,
            borderBottom: pathname === "/checkin" || pathname.startsWith("/checkin") ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent",
            opacity: pathname === "/checkin" || pathname.startsWith("/checkin") ? 1 : 0.8,
            transition: "all 0.2s ease"
          }}>Check-in</Link>
        </div>
      )}

      {/* NAVIGATION - ONLY FOR VERWALTUNG */}
      {(pathname === "/verwaltung-neu" || pathname.startsWith("/verwaltung-neu/")) && (
        <div style={{
          width: "100%",
          marginTop: 16,
          display: "flex",
          gap: 20,
          fontSize: 14
        }}>
          <Link href="/verwaltung-neu" style={{
            color: "white",
            textDecoration: "none",
            fontWeight: 500,
            paddingBottom: 6,
            borderBottom: pathname === "/verwaltung-neu" || pathname === "/verwaltung-neu/" ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent",
            opacity: pathname === "/verwaltung-neu" || pathname === "/verwaltung-neu/" ? 1 : 0.8,
            transition: "all 0.2s ease"
          }}>Dashboard</Link>
          <Link href="/verwaltung-neu/freigaben" style={{
            color: "white",
            textDecoration: "none",
            fontWeight: 500,
            paddingBottom: 6,
            borderBottom: pathname === "/verwaltung-neu/freigaben" || pathname.startsWith("/verwaltung-neu/freigaben") ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent",
            opacity: pathname === "/verwaltung-neu/freigaben" || pathname.startsWith("/verwaltung-neu/freigaben") ? 1 : 0.8,
            transition: "all 0.2s ease"
          }}>Freigaben</Link>
          <Link href="/verwaltung-neu/mitglieder" style={{
            color: "white",
            textDecoration: "none",
            fontWeight: 500,
            paddingBottom: 6,
            borderBottom: pathname === "/verwaltung-neu/mitglieder" || pathname.startsWith("/verwaltung-neu/mitglieder") ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent",
            opacity: pathname === "/verwaltung-neu/mitglieder" || pathname.startsWith("/verwaltung-neu/mitglieder") ? 1 : 0.8,
            transition: "all 0.2s ease"
          }}>Mitglieder</Link>
        </div>
      )}
    </div>
  )
}
