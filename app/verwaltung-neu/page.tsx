"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { container, card, pageTitle } from "@/lib/ui"

export default function DashboardPage() {
  const [totalMembers, setTotalMembers] = useState<number | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      const res = await fetch("/api/admin/get-members", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, pageSize: 999 }),
      })
      if (!res.ok) return

      const result = await res.json()
      const members: { is_approved?: boolean }[] = result.data ?? []
      setTotalMembers(result.total ?? members.length)
      setPendingApprovals(members.filter((m) => !m.is_approved).length)
    }

    void load().catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") {
        return
      }
    })

    return () => {
      controller.abort()
    }
  }, [])

  const statCard = {
    ...card,
    cursor: "pointer" as const,
    textDecoration: "none" as const,
    display: "block",
    marginBottom: 12,
  }

  return (
    <div style={container}>
      <div style={pageTitle}>Admin-Übersicht</div>

      <Link href="/verwaltung-neu/mitglieder" style={{ textDecoration: "none" }}>
        <div style={statCard}>
          <div style={{ fontSize: 14, color: "#666" }}>Mitglieder gesamt</div>
          <div style={{ fontSize: 22, fontWeight: 600, margin: "6px 0" }}>
            {totalMembers ?? "…"}
          </div>
        </div>
      </Link>

      <Link href="/verwaltung-neu/freigaben" style={{ textDecoration: "none" }}>
        <div style={statCard}>
          <div style={{ fontSize: 14, color: "#666" }}>Offene Freigaben</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              margin: "6px 0",
              color: pendingApprovals ? "#b45309" : "#15803d",
            }}
          >
            {pendingApprovals ?? "…"}
          </div>
        </div>
      </Link>

      <Link href="/verwaltung-neu/qr-code" style={{ textDecoration: "none" }}>
        <div style={statCard}>
          <div style={{ fontSize: 14, color: "#666" }}>QR Code</div>
          <div style={{ fontSize: 16, fontWeight: 600, margin: "6px 0" }}>Anzeigen →</div>
        </div>
      </Link>
    </div>
  )
}

