"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import MitgliederListClient from "./MitgliederListClient"

type AdminMemberListRow = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  birthdate?: string | null
  base_group?: string | null
  office_list_status?: string | null
  office_list_group?: string | null
  office_list_checked_at?: string | null
  is_trial?: boolean | null
  is_approved?: boolean | null
  email_verified?: boolean | null
  member_phase?: "trial" | "extended" | "member"
  created_at?: string | null
  checkinCount: number
  checkedInToday?: boolean
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

export default function MitgliederPage() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [members, setMembers] = useState<AdminMemberListRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalTodayCount, setTotalTodayCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(() => parsePositiveInt(searchParams.get("page"), 1))
  const [error, setError] = useState<string | null>(null)

  const PAGE_SIZE = 10

  const initialListState = useMemo(() => ({
    search: searchParams.get("q") ?? "",
    groupFilter: searchParams.get("group") ?? "all",
    statusFilter: searchParams.get("status") ?? "all",
    gsFilter: searchParams.get("gs") ?? "all",
  }), [searchParams])

  const currentListUrl = useMemo(() => {
    const query = searchParams.toString()
    return query ? `${pathname}?${query}` : pathname
  }, [pathname, searchParams])

  useEffect(() => {
    setCurrentPage(parsePositiveInt(searchParams.get("page"), 1))
  }, [searchParams])

  function updateListUrl(nextState: {
    page?: number
    search?: string
    groupFilter?: string
    statusFilter?: string
    gsFilter?: string
  }) {
    const params = new URLSearchParams(searchParams.toString())

    const nextPage = nextState.page ?? currentPage
    if (nextPage > 1) {
      params.set("page", String(nextPage))
    } else {
      params.delete("page")
    }

    const search = nextState.search ?? initialListState.search
    if (search.trim()) params.set("q", search)
    else params.delete("q")

    const groupFilter = nextState.groupFilter ?? initialListState.groupFilter
    if (groupFilter !== "all") params.set("group", groupFilter)
    else params.delete("group")

    const statusFilter = nextState.statusFilter ?? initialListState.statusFilter
    if (statusFilter !== "all") params.set("status", statusFilter)
    else params.delete("status")

    const gsFilter = nextState.gsFilter ?? initialListState.gsFilter
    if (gsFilter !== "all") params.set("gs", gsFilter)
    else params.delete("gs")

    const nextQuery = params.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
  }

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
            pageSize: PAGE_SIZE,
            search: initialListState.search,
            groupFilter: initialListState.groupFilter,
            statusFilter: initialListState.statusFilter,
            gsFilter: initialListState.gsFilter,
            fields: [
              "id",
              "name",
              "first_name",
              "last_name",
              "email",
              "phone",
              "birthdate",
              "base_group",
              "office_list_status",
              "office_list_group",
              "office_list_checked_at",
              "is_trial",
              "is_approved",
              "email_verified",
              "member_phase",
              "created_at",
            ],
              includeCheckinStats: false,
              includeCheckedInToday: false,
              includeTodayTotal: false,
            includePendingCount: false,
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
        setTotalTodayCount(typeof result.totalTodayCount === "number" ? result.totalTodayCount : 0)
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
  }, [currentPage, initialListState.groupFilter, initialListState.gsFilter, initialListState.search, initialListState.statusFilter])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages || 1)

  useEffect(() => {
    if (currentPage > totalPages) {
      const nextPage = totalPages || 1
      setCurrentPage(nextPage)
      updateListUrl({ page: nextPage })
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

      <MitgliederListClient
        members={members}
        totalTodayCount={totalTodayCount}
        hasCheckinData={false}
        initialSearch={initialListState.search}
        initialGroupFilter={initialListState.groupFilter}
        initialStatusFilter={initialListState.statusFilter}
        initialGsFilter={initialListState.gsFilter}
        currentListUrl={currentListUrl}
        onFiltersChanged={(nextFilters) => {
          setCurrentPage(1)
          updateListUrl({
            page: 1,
            search: nextFilters.search,
            groupFilter: nextFilters.groupFilter,
            statusFilter: nextFilters.statusFilter,
            gsFilter: nextFilters.gsFilter,
          })
        }}
      />

      <div className="flex items-center gap-3">
        <button
          disabled={currentPage <= 1}
          onClick={() => {
            const nextPage = safePage - 1
            setCurrentPage(nextPage)
            updateListUrl({ page: nextPage })
          }}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 disabled:opacity-50"
        >
          Zurück
        </button>

        <span className="text-sm text-zinc-600">Seite {safePage} / {totalPages}</span>

        <button
          disabled={currentPage >= totalPages}
          onClick={() => {
            const nextPage = safePage + 1
            setCurrentPage(nextPage)
            updateListUrl({ page: nextPage })
          }}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 disabled:opacity-50"
        >
          Weiter
        </button>
      </div>
    </div>
  )
}
