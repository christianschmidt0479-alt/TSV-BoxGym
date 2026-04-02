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
      supabase.from("checkins").select("id, group_name, date, members(is_trial)").eq("date", today),
      supabase.from("members").select("id, base_group, needs_trainer_assist_checkin"),
    ])

    if (checkinsResponse.error) throw checkinsResponse.error
    if (membersResponse.error) throw membersResponse.error

    return NextResponse.json({
      todayCheckins: (checkinsResponse.data ?? []).map((row) => ({
        ...row,
        group_name: normalizeTrainingGroup(row.group_name) || row.group_name,
      })),
      memberRows: (membersResponse.data ?? []).map((row) => ({
        ...row,
        base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
      })),
    })
  } catch (error) {
    console.error("trainer overview failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
