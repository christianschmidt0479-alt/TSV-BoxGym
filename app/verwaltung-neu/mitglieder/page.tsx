"use client"

import { useState, useEffect } from "react"
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
  checkinCount: number
  checkedInToday?: boolean
}

export default function MitgliederPage() {
  const [members, setMembers] = useState<AdminMemberListRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const PAGE_SIZE = 10

  useEffect(() => {
    async function loadMembers() {
      try {
        const res = await fetch("/api/admin/get-members", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            page,
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
        console.error(err)
        setError("Netzwerkfehler beim Laden der Mitglieder.")
      }
    }

    loadMembers()
  }, [page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Zurück
        </button>

        <span>Seite {page} / {totalPages}</span>

        <button
          disabled={page === totalPages}
          onClick={() => setPage(page + 1)}
        >
          Weiter
        </button>
      </div>
    </div>
  )
}
