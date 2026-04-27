"use client"

import { useEffect, useState } from "react"

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
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="text-base font-semibold text-zinc-900">Mitglieder</div>
        <div className="text-sm text-zinc-600">Alle Mitglieder und Check-in-Status</div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <MitgliederListClient members={members} />

      <div className="flex items-center gap-3">
        <button
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage(safePage - 1)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 disabled:opacity-50"
        >
          Zurück
        </button>

        <span className="text-sm text-zinc-600">Seite {safePage} / {totalPages}</span>

        <button
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage(safePage + 1)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 disabled:opacity-50"
        >
          Weiter
        </button>
      </div>
    </div>
  )
}
