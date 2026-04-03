import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { buildBirthdayOverview, getBirthdayDisplayName, getTurningAgeOnIsoDate, isBirthdayOnIsoDate } from "@/lib/birthdays"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`trainer-overview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const today = new URL(request.url).searchParams.get("today")?.trim()
    if (!today) {
      return new NextResponse("Missing today", { status: 400 })
    }

    const supabase = getServerSupabase()
    const [checkinsResponse, membersResponse] = await Promise.all([
      supabase
        .from("checkins")
        .select("id, member_id, group_name, date, members(id, name, first_name, last_name, birthdate, is_trial)")
        .eq("date", today),
      supabase.from("members").select("id, name, first_name, last_name, birthdate, base_group, needs_trainer_assist_checkin"),
    ])

    if (checkinsResponse.error) throw checkinsResponse.error
    if (membersResponse.error) throw membersResponse.error

    const normalizedMembers = (membersResponse.data ?? []).map((row) => ({
      ...row,
      base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
    }))

    const birthdayCheckinsByMemberId = new Map<string, {
      id: string
      member_id: string
      group_name: string
      display_name: string
      birthdate: string
      turning_age: number
    }>()

    for (const row of checkinsResponse.data ?? []) {
      const member = Array.isArray(row.members) ? (row.members[0] ?? null) : row.members
      const birthdate = member?.birthdate?.trim()
      const memberId = row.member_id?.trim()
      if (!birthdate || !memberId || !isBirthdayOnIsoDate(birthdate, today)) continue

      const turningAge = getTurningAgeOnIsoDate(birthdate, today)
      if (turningAge === null) continue
      if (birthdayCheckinsByMemberId.has(memberId)) continue

      birthdayCheckinsByMemberId.set(memberId, {
        id: row.id,
        member_id: memberId,
        group_name: normalizeTrainingGroup(row.group_name) || row.group_name,
        display_name: getBirthdayDisplayName(member ?? {}),
        birthdate,
        turning_age: turningAge,
      })
    }

    const birthdayOverview = buildBirthdayOverview(normalizedMembers, today, 5)

    return NextResponse.json({
      todayCheckins: (checkinsResponse.data ?? []).map((row) => ({
        ...row,
        group_name: normalizeTrainingGroup(row.group_name) || row.group_name,
      })),
      todayBirthdays: birthdayOverview.todayBirthdays,
      birthdayCheckins: Array.from(birthdayCheckinsByMemberId.values()).sort(
        (a, b) => a.group_name.localeCompare(b.group_name, "de") || a.display_name.localeCompare(b.display_name, "de")
      ),
      memberRows: normalizedMembers.map((row) => ({
        ...row,
      })),
    })
  } catch (error) {
    console.error("trainer overview failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
