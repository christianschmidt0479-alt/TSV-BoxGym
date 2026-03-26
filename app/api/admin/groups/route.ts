import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
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

    const rateLimit = checkRateLimit(`admin-groups:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
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
      memberRows: membersResponse.data ?? [],
      checkinRows: checkinsResponse.data ?? [],
    })
  } catch (error) {
    console.error("admin groups failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
