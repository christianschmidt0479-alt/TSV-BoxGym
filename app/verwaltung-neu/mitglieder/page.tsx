"use client"

import { useEffect, useState } from "react"
import { container, pageTitle } from "@/lib/ui"
import MitgliederListClient from "./MitgliederListClient"

type AdminMemberListRow = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  base_group?: string | null
  office_list_group?: string | null
  is_trial?: boolean | null
  is_approved?: boolean | null
  email_verified?: boolean | null
  member_phase?: "trial" | "extended" | "member"
  checkinCount: number
  checkedInToday?: boolean
}

export default function MitgliederPage() {
  const [members, setMembers] = useState<AdminMemberListRow[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const PAGE_SIZE = 10

  useEffect(() => {
    const controller = new AbortController()

    async function loadMembers() {
      try {
        const res = await fetch("/api/admin/get-members", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          signal: controller.signal,
          body: JSON.stringify({
            page: currentPage,
            pageSize: PAGE_SIZE
          })
        })

        const result = await res.json()

        if (!res.ok) {
          setError(result.error || "Fehler beim Laden der Mitglieder.")
          setMembers([])
          setTotal(0)
          return
        }

        setMembers(result.data || [])
        setTotal(result.total || 0)
        setError(null)
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return
        }
        console.error(err)
        setError("Netzwerkfehler beim Laden der Mitglieder.")
      }
    }

    loadMembers()

    return () => {
      controller.abort()
    }
  }, [currentPage])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages || 1)

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages || 1)
    }
  }, [currentPage, totalPages])

  return (
    <div style={container}>
      <div style={pageTitle}>Mitglieder</div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 8 }}>
          {error}
        </div>
      )}

      <MitgliederListClient members={members} />

      <div style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <button
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage(safePage - 1)}
        >
          Zurück
        </button>

        <span>Seite {safePage} / {totalPages}</span>

        <button
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage(safePage + 1)}
        >
          Weiter
        </button>
      </div>
    </div>
  )
}
