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

    const rateLimit = await checkRateLimitAsync(`admin-overview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const today = new URL(request.url).searchParams.get("today")?.trim()
    if (!today) {
      return new NextResponse("Missing today", { status: 400 })
    }

    const supabase = getServerSupabase()
    const [membersResponse, checkinsResponse, digestQueueResponse] = await Promise.all([
      supabase.from("members").select("id, first_name, last_name, name, birthdate, base_group, is_trial, is_approved"),
      supabase.from("checkins").select("id, group_name, date").eq("date", today),
      session.accountRole === "admin"
        ? supabase
            .from("admin_notification_queue")
            .select("id, kind, member_name, created_at, sent_at")
            .is("sent_at", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (checkinsResponse.error) throw checkinsResponse.error
    if (digestQueueResponse.error) throw digestQueueResponse.error

    return NextResponse.json({
      memberRows: (membersResponse.data ?? []).map((row) => ({
        ...row,
        base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
      })),
      todayCheckins: (checkinsResponse.data ?? []).map((row) => ({
        ...row,
        group_name: normalizeTrainingGroup(row.group_name) || row.group_name,
      })),
      digestQueueRows: digestQueueResponse.data ?? [],
    })
  } catch (error) {
    console.error("admin overview failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
