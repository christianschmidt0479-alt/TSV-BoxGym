import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
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
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`trainer-today:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const today = new URL(request.url).searchParams.get("today")?.trim()
    if (!today) {
      return new NextResponse("Missing today", { status: 400 })
    }

    const supabase = getServerSupabase()
    const response = await supabase
      .from("checkins")
      .select("id, group_name, checkin_mode, date, time, created_at, members(id, name, first_name, last_name, is_trial)")
      .eq("date", today)
      .order("created_at", { ascending: false })

    if (response.error) throw response.error

    return NextResponse.json({
      todayCheckins: response.data ?? [],
    })
  } catch (error) {
    console.error("trainer today failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
