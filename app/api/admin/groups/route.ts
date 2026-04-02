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
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-groups:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [membersResponse, checkinsResponse] = await Promise.all([
      supabase.from("members").select("id, base_group, is_trial, is_approved"),
      supabase.from("checkins").select("id, group_name, date"),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (checkinsResponse.error) throw checkinsResponse.error

    return NextResponse.json({
      memberRows: (membersResponse.data ?? []).map((row) => ({
        ...row,
        base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
      })),
      checkinRows: (checkinsResponse.data ?? []).map((row) => ({
        ...row,
        group_name: normalizeTrainingGroup(row.group_name) || row.group_name,
      })),
    })
  } catch (error) {
    console.error("admin groups failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
