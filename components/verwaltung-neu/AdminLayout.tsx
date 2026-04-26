import type { ReactNode } from "react"

export default function AdminLayout({ children }: { children: ReactNode }) {
  const path = typeof window !== "undefined" ? window.location.pathname : "";

  const linkStyle = (href: string) => ({
    color: "white",
    textDecoration: "none",
    fontWeight: path === href ? 700 : 400,
    borderBottom: path === href ? "2px solid white" : "none",
    paddingBottom: 4
  });

  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh" }}>

      {/* HEADER */}
      <div style={{
        background: "#0f2a44",
        color: "white",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 1000,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
      }}>

        {/* LEFT: Logo + Name */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12
        }}>

          <div style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            color: "#0f2a44",
            fontSize: 16
          }}>
            TSV
          </div>

          <div style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: 1.1
          }}>
            <span style={{ fontWeight: 700 }}>
              TSV BoxGym
            </span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              Adminbereich
            </span>
          </div>

        </div>

        {/* NAV */}
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          <a href="/verwaltung-neu" style={linkStyle("/verwaltung-neu")}>Dashboard</a>
          <a href="/verwaltung-neu/freigaben" style={linkStyle("/verwaltung-neu/freigaben")}>Freigaben</a>
          <a href="/verwaltung-neu/mitglieder" style={linkStyle("/verwaltung-neu/mitglieder")}>Mitglieder</a>
        </div>

      </div>

      {/* CONTENT */}
      <div style={{
        maxWidth: 900,
        margin: "40px auto",
        padding: "0 20px"
      }}>
        {children}
      </div>

    </div>
  );
}
