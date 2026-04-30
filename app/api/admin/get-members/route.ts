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
      summaryOnly = false,
      includeTodayTotal = true,
    } = body as {
      page?: number
      pageSize?: number
      fields?: string[]
      summaryOnly?: boolean
      includeTodayTotal?: boolean
    }
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
    const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10
    const from = (safePage - 1) * safePageSize
    const to = from + safePageSize - 1

    const selectedFields = Array.isArray(fields)
      ? Array.from(
          new Set(
            fields.filter(
              (value): value is string => typeof value === "string" && ALLOWED_MEMBER_FIELDS.has(value)
            )
          )
        )
      : []

    if (!selectedFields.includes("id")) {
      selectedFields.unshift("id")
    }

    const selectColumns = selectedFields.length > 0
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

    const { data: members, error, count } = await supabase
      .from("members")
      .select(selectColumns, { count: "exact" })
      .range(from, to)

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
      memberIds.length > 0
        ? supabase.from("checkins").select("member_id, date, created_at").in("member_id", memberIds)
        : Promise.resolve({ data: [] as { member_id: string | null; date: string | null; created_at: string | null }[], error: null }),
      includeTodayTotal
        ? supabase.from("checkins").select("member_id").eq("date", todayBerlin)
        : Promise.resolve({ data: [] as { member_id: string | null }[], error: null }),
      supabase.from("members").select("id", { count: "exact", head: true }).eq("is_approved", false),
    ])

    if (pageCheckinsResult.error) {
      console.error("SUPABASE ERROR:", pageCheckinsResult.error)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }

    for (const row of pageCheckinsResult.data ?? []) {
      if (!row.member_id) continue
      checkinCountByMemberId.set(row.member_id, (checkinCountByMemberId.get(row.member_id) ?? 0) + 1)

      if (isTodayCheckinInBerlin(row, todayBerlin)) {
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
      pendingCount: pendingCountResult.count ?? 0,
    }), { status: 200 })
  } catch (error) {
    console.error("API ERROR:", error)
    return new Response(JSON.stringify({ error: true, message: "Serverfehler" }), { status: 500 })
  }
}
