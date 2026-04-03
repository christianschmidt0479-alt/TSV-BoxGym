import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { buildBirthdayOverview } from "@/lib/birthdays"
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
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-birthdays:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const today = new URL(request.url).searchParams.get("today")?.trim()
    if (!today) {
      return new NextResponse("Missing today", { status: 400 })
    }

    const supabase = getServerSupabase()
    const membersResponse = await supabase
      .from("members")
      .select("id, name, first_name, last_name, birthdate, base_group, is_trial, is_approved")

    if (membersResponse.error) throw membersResponse.error

    const members = (membersResponse.data ?? []).map((row) => ({
      ...row,
      base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
    }))

    const overview = buildBirthdayOverview(members, today, 5)

    return NextResponse.json({
      today,
      todayBirthdays: overview.todayBirthdays,
      upcomingBirthdays: overview.upcomingBirthdays,
      recentBirthdays: overview.recentBirthdays,
    })
  } catch (error) {
    console.error("admin birthdays failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}