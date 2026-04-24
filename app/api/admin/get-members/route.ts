import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { verifyTrainerSessionToken } from "@/lib/authSession"

function berlinDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export async function POST(req: Request) {
  const session = (await cookies()).get("trainer_session")

  if (!session) {
    return NextResponse.json({ ok: false, error: "Nicht autorisiert" }, { status: 401 })
  }

  const valid = await verifyTrainerSessionToken(session.value)

  if (!valid || valid.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Keine Berechtigung" }, { status: 403 })
  }

  const { page = 1, pageSize = 10 } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: members, error, count } = await supabase
    .from("members")
    .select("id, name, first_name, last_name, email, base_group, office_list_group, is_trial, is_approved, email_verified", { count: "exact" })

  if (error) {
    console.error(error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: checkins, error: checkinsError } = await supabase
    .from("checkins")
    .select("member_id, created_at")

  if (checkinsError) {
    console.error(checkinsError)
    return NextResponse.json({ error: checkinsError.message }, { status: 500 })
  }

  const checkinCountByMemberId = new Map<string, number>()
  const checkedInTodayByMemberId = new Set<string>()
  const todayBerlin = berlinDayKey(new Date())

  for (const row of checkins ?? []) {
    if (!row.member_id) continue
    checkinCountByMemberId.set(row.member_id, (checkinCountByMemberId.get(row.member_id) ?? 0) + 1)

    if (row.created_at) {
      const createdAt = new Date(row.created_at)
      if (!Number.isNaN(createdAt.getTime()) && berlinDayKey(createdAt) === todayBerlin) {
        checkedInTodayByMemberId.add(row.member_id)
      }
    }
  }

  const withCheckinCounts = (members ?? []).map((member) => ({
    ...member,
    checkinCount: checkinCountByMemberId.get(member.id) ?? 0,
    checkedInToday: checkedInTodayByMemberId.has(member.id),
  }))

  withCheckinCounts.sort((a, b) => {
    const aNotApprovedRank = a.is_approved ? 1 : 0
    const bNotApprovedRank = b.is_approved ? 1 : 0
    if (aNotApprovedRank !== bNotApprovedRank) {
      return aNotApprovedRank - bNotApprovedRank
    }

    if (a.checkinCount !== b.checkinCount) {
      return b.checkinCount - a.checkinCount
    }

    const aName = (a.name || `${a.first_name || ""} ${a.last_name || ""}`).trim()
    const bName = (b.name || `${b.first_name || ""} ${b.last_name || ""}`).trim()
    return aName.localeCompare(bName, "de")
  })

  const from = (page - 1) * pageSize
  const to = from + pageSize
  const pagedMembers = withCheckinCounts.slice(from, to)

  return NextResponse.json({
    data: pagedMembers,
    total: count
  })
}
