import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
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

    const rateLimit = await checkRateLimitAsync(`trainer-members:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const url = new URL(request.url)
    const memberId = url.searchParams.get("memberId")?.trim()
    const inaktiv = url.searchParams.get("inaktiv") === "1"
    const todayParam = url.searchParams.get("today")?.trim()
    const supabase = getServerSupabase()

    if (memberId) {
      const attendanceResponse = await supabase
        .from("checkins")
        .select("id, member_id, group_name, date, time, created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })

      if (attendanceResponse.error) throw attendanceResponse.error

      return NextResponse.json({
        attendanceRows: (attendanceResponse.data ?? []).map((row) => ({
          ...row,
          group_name: normalizeTrainingGroup(row.group_name) || row.group_name,
        })),
      })
    }

    const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
    if (inaktiv) {
      if (!todayParam || !DATE_PATTERN.test(todayParam)) {
        return new NextResponse("Missing or invalid today", { status: 400 })
      }

      const threeWeeksAgo = new Date(todayParam)
      threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21)
      const eightWeeksAgo = new Date(todayParam)
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)
      const threeWeeksAgoStr = threeWeeksAgo.toISOString().slice(0, 10)
      const eightWeeksAgoStr = eightWeeksAgo.toISOString().slice(0, 10)

      const [recentResponse, olderResponse, membersResponse] = await Promise.all([
        supabase.from("checkins").select("member_id").gte("date", threeWeeksAgoStr).lt("date", todayParam),
        supabase.from("checkins").select("member_id, date").gte("date", eightWeeksAgoStr).lt("date", threeWeeksAgoStr),
        supabase.from("members").select("id, name, first_name, last_name, birthdate, base_group, is_trial").order("last_name", { ascending: true }).order("first_name", { ascending: true }),
      ])

      if (recentResponse.error) throw recentResponse.error
      if (olderResponse.error) throw olderResponse.error
      if (membersResponse.error) throw membersResponse.error

      const recentIds = new Set((recentResponse.data ?? []).map((r) => r.member_id))

      // Letzten Check-in und Anzahl pro Mitglied im Vergleichszeitraum (3–8 Wochen)
      const olderStatsMap = new Map<string, { lastDate: string; count: number }>()
      for (const row of olderResponse.data ?? []) {
        const existing = olderStatsMap.get(row.member_id)
        if (!existing) {
          olderStatsMap.set(row.member_id, { lastDate: row.date, count: 1 })
        } else {
          olderStatsMap.set(row.member_id, {
            lastDate: row.date > existing.lastDate ? row.date : existing.lastDate,
            count: existing.count + 1,
          })
        }
      }

      const inactiveMembers = (membersResponse.data ?? [])
        .filter((m) => olderStatsMap.has(m.id) && !recentIds.has(m.id))
        .map((row) => {
          const stats = olderStatsMap.get(row.id)!
          return {
            ...row,
            base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
            lastCheckin: stats.lastDate,
            recentCheckinCount: stats.count,
          }
        })
        .sort((a, b) => a.lastCheckin.localeCompare(b.lastCheckin)) // ältester Check-in zuerst

      return NextResponse.json({
        members: inactiveMembers,
        inaktivMode: true,
      })
    }

    const membersResponse = await supabase
      .from("members")
      .select("id, name, first_name, last_name, birthdate, base_group, is_trial")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })

    if (membersResponse.error) throw membersResponse.error

    return NextResponse.json({
      members: (membersResponse.data ?? []).map((row) => ({
        ...row,
        base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
      })),
    })
  } catch (error) {
    console.error("trainer members failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
