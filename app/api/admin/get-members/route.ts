import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { verifyTrainerSessionToken } from "@/lib/authSession"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { isTodayCheckinInBerlin } from "@/lib/dateFormat"

const ALLOWED_MEMBER_FIELDS = new Set([
  "id",
  "name",
  "first_name",
  "last_name",
  "birthdate",
  "email",
  "phone",
  "guardian_name",
  "email_verified",
  "email_verified_at",
  "privacy_accepted_at",
  "is_trial",
  "is_approved",
  "base_group",
  "office_list_status",
  "office_list_group",
  "office_list_checked_at",
  "is_competition_member",
  "has_competition_pass",
  "member_phase",
  "created_at",
  "last_verification_sent_at",
])

const OPTIONAL_MEMBER_FIELDS = new Set([
  "office_list_status",
  "office_list_group",
  "office_list_checked_at",
  "last_verification_sent_at",
])

const DEFAULT_MEMBER_SELECT = [
  "id",
  "name",
  "first_name",
  "last_name",
  "email",
  "base_group",
  "office_list_group",
  "is_trial",
  "is_approved",
  "email_verified",
  "member_phase",
  "created_at",
].join(", ")

function berlinDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function normalizeGsFilter(value: unknown) {
  return value === "green" || value === "yellow" || value === "red" || value === "gray" ? value : "all"
}

function normalizeStatusFilter(value: unknown) {
  return value === "approved" || value === "pending" ? value : "all"
}

function normalizeSearch(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeGroupFilter(value: unknown) {
  if (typeof value !== "string") return "all"
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : "all"
}

export async function POST(req: Request) {
  try {
    if (!isAllowedOrigin(req)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const session = (await cookies()).get("trainer_session")

    if (!session) {
      return NextResponse.json({ ok: false, error: "Nicht autorisiert" }, { status: 401 })
    }

    const valid = await verifyTrainerSessionToken(session.value)

    if (!valid || valid.accountRole !== "admin") {
      return NextResponse.json({ ok: false, error: "Keine Berechtigung" }, { status: 403 })
    }

    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 })
    }

    const {
      page = 1,
      pageSize = 10,
      fields,
      q,
      search,
      groupFilter,
      statusFilter,
      gsFilter,
      summaryOnly = false,
      includeTodayTotal = true,
      includePendingCount = true,
      includeCheckinStats = true,
      includeCheckedInToday = true,
    } = body as {
      page?: number
      pageSize?: number
      fields?: string[]
      q?: string
      search?: string
      groupFilter?: string
      statusFilter?: "all" | "approved" | "pending"
      gsFilter?: "all" | "green" | "yellow" | "red" | "gray"
      summaryOnly?: boolean
      includeTodayTotal?: boolean
      includePendingCount?: boolean
      includeCheckinStats?: boolean
      includeCheckedInToday?: boolean
    }
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
    const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10
    const from = (safePage - 1) * safePageSize
    const to = from + safePageSize - 1
    const normalizedSearch = normalizeSearch(search) || normalizeSearch(q)
    const normalizedGroupFilter = normalizeGroupFilter(groupFilter)
    const normalizedStatusFilter = normalizeStatusFilter(statusFilter)
    const normalizedGsFilter = normalizeGsFilter(gsFilter)

    const selectedFields = Array.isArray(fields)
      ? Array.from(
          new Set(
            fields.filter(
              (value): value is string => typeof value === "string" && ALLOWED_MEMBER_FIELDS.has(value)
            )
          )
        )
      : null

    if (selectedFields && !selectedFields.includes("id")) {
      selectedFields.unshift("id")
    }

    const selectColumns = selectedFields && selectedFields.length > 0
      ? selectedFields.join(", ")
      : DEFAULT_MEMBER_SELECT

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (summaryOnly) {
      const [membersCountResult, pendingCountResult] = await Promise.all([
        supabase.from("members").select("id", { count: "exact", head: true }),
        supabase.from("members").select("id", { count: "exact", head: true }).eq("is_approved", false),
      ])

      if (membersCountResult.error || pendingCountResult.error) {
        console.error("SUPABASE ERROR:", membersCountResult.error ?? pendingCountResult.error)
        return new Response(JSON.stringify({ error: true }), { status: 500 })
      }

      return new Response(JSON.stringify({
        data: [],
        total: membersCountResult.count ?? 0,
        totalTodayCount: 0,
        pendingCount: pendingCountResult.count ?? 0,
      }), { status: 200 })
    }

    let membersQuery = supabase
      .from("members")
      .select(selectColumns, { count: "exact" })

    if (normalizedSearch) {
      const searchPattern = `%${normalizedSearch}%`
      membersQuery = membersQuery.or(
        [
          `name.ilike.${searchPattern}`,
          `first_name.ilike.${searchPattern}`,
          `last_name.ilike.${searchPattern}`,
          `email.ilike.${searchPattern}`,
          `phone.ilike.${searchPattern}`,
        ].join(",")
      )
    }

    if (normalizedGroupFilter !== "all") {
      membersQuery = membersQuery.eq("base_group", normalizedGroupFilter)
    }

    if (normalizedStatusFilter === "approved") {
      membersQuery = membersQuery.eq("is_approved", true)
    }
    if (normalizedStatusFilter === "pending") {
      membersQuery = membersQuery.eq("is_approved", false)
    }

    if (normalizedGsFilter === "green" || normalizedGsFilter === "yellow" || normalizedGsFilter === "red") {
      membersQuery = membersQuery.eq("office_list_status", normalizedGsFilter)
    }
    if (normalizedGsFilter === "gray") {
      membersQuery = membersQuery.is("office_list_status", null)
    }

    let membersResult = await membersQuery.range(from, to)

    if (membersResult.error && selectedFields && selectedFields.length > 0) {
      const missingOptionalFields = selectedFields.filter((field) => OPTIONAL_MEMBER_FIELDS.has(field))
      const missingColumnMessage = membersResult.error.message?.toLowerCase() ?? ""
      const isMissingColumnError =
        missingColumnMessage.includes("does not exist") ||
        missingColumnMessage.includes("schema cache") ||
        missingColumnMessage.includes("could not find")

      if (isMissingColumnError && missingOptionalFields.length > 0) {
        const fallbackFields = selectedFields.filter((field) => !OPTIONAL_MEMBER_FIELDS.has(field))
        const fallbackSelect = fallbackFields.join(", ")

        let fallbackQuery = supabase
          .from("members")
          .select(fallbackSelect, { count: "exact" })

        if (normalizedSearch) {
          const searchPattern = `%${normalizedSearch}%`
          fallbackQuery = fallbackQuery.or(
            [
              `name.ilike.${searchPattern}`,
              `first_name.ilike.${searchPattern}`,
              `last_name.ilike.${searchPattern}`,
              `email.ilike.${searchPattern}`,
              `phone.ilike.${searchPattern}`,
            ].join(",")
          )
        }

        if (normalizedGroupFilter !== "all") {
          fallbackQuery = fallbackQuery.eq("base_group", normalizedGroupFilter)
        }

        if (normalizedStatusFilter === "approved") {
          fallbackQuery = fallbackQuery.eq("is_approved", true)
        }
        if (normalizedStatusFilter === "pending") {
          fallbackQuery = fallbackQuery.eq("is_approved", false)
        }

        if (normalizedGsFilter === "green" || normalizedGsFilter === "yellow" || normalizedGsFilter === "red") {
          fallbackQuery = fallbackQuery.eq("office_list_status", normalizedGsFilter)
        }
        if (normalizedGsFilter === "gray") {
          fallbackQuery = fallbackQuery.is("office_list_status", null)
        }

        membersResult = await fallbackQuery.range(from, to)
      }
    }

    const { data: members, error, count } = membersResult

    if (error) {
      console.error("SUPABASE ERROR:", error)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }

    const membersList = ((members ?? []) as unknown as Array<Record<string, unknown>>)
      .filter((member): member is Record<string, unknown> & { id: string } =>
        typeof member.id === "string" && member.id.length > 0
      )

    const memberIds = membersList.map((member) => member.id)

    const checkinCountByMemberId = new Map<string, number>()
    const checkedInTodayByMemberId = new Set<string>()
    const todayBerlin = berlinDayKey(new Date())

    const [pageCheckinsResult, todayCheckinsResult, pendingCountResult] = await Promise.all([
      includeCheckinStats && memberIds.length > 0
        ? supabase.from("checkins").select("member_id, date, created_at").in("member_id", memberIds)
        : Promise.resolve({ data: [] as { member_id: string | null; date: string | null; created_at: string | null }[], error: null }),
      includeTodayTotal
        ? supabase.from("checkins").select("member_id").eq("date", todayBerlin)
        : Promise.resolve({ data: [] as { member_id: string | null }[], error: null }),
      includePendingCount
        ? supabase.from("members").select("id", { count: "exact", head: true }).eq("is_approved", false)
        : Promise.resolve({ count: 0, error: null }),
    ])

    if (pageCheckinsResult.error) {
      console.error("SUPABASE ERROR:", pageCheckinsResult.error)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }

    for (const row of pageCheckinsResult.data ?? []) {
      if (!row.member_id) continue
      checkinCountByMemberId.set(row.member_id, (checkinCountByMemberId.get(row.member_id) ?? 0) + 1)

      if (includeCheckedInToday && isTodayCheckinInBerlin(row, todayBerlin)) {
        checkedInTodayByMemberId.add(row.member_id)
      }
    }

    if (todayCheckinsResult.error) {
      console.error("SUPABASE ERROR:", todayCheckinsResult.error)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }

    const withCheckinCounts = membersList.map((member) => ({
      ...member,
      checkinCount: checkinCountByMemberId.get(member.id) ?? 0,
      checkedInToday: checkedInTodayByMemberId.has(member.id),
    }))

    const totalTodayCount = new Set(
      (todayCheckinsResult.data ?? [])
        .map((row) => row.member_id)
        .filter((memberId): memberId is string => typeof memberId === "string" && memberId.length > 0)
    ).size

    return new Response(JSON.stringify({
      data: withCheckinCounts,
      total: count,
      totalTodayCount,
      pendingCount: includePendingCount ? (pendingCountResult.count ?? 0) : 0,
    }), { status: 200 })
  } catch (error) {
    console.error("API ERROR:", error)
    return new Response(JSON.stringify({ error: true, message: "Serverfehler" }), { status: 500 })
  }
}
