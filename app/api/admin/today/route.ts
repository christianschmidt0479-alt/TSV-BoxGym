import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { isTodayCheckinInBerlin } from "@/lib/dateFormat"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

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

    const rateLimit = await checkRateLimitAsync(`admin-today:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const today = new URL(request.url).searchParams.get("today")?.trim()
    if (!today) {
      return new NextResponse("Missing today", { status: 400 })
    }

    const supabase = getServerSupabase()
    const [checkinsResponse, membersResponse] = await Promise.all([
      supabase.from("checkins").select("id, member_id, group_name, date, created_at"),
      supabase.from("members").select("id, base_group"),
    ])

    if (checkinsResponse.error) throw checkinsResponse.error
    if (membersResponse.error) throw membersResponse.error

    const todayCheckins = (checkinsResponse.data ?? []).filter((row) => isTodayCheckinInBerlin(row, today))

    return NextResponse.json({
      todayCheckins,
      members: membersResponse.data ?? [],
    })
  } catch (error) {
    console.error("admin today failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
