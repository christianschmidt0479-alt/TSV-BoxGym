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
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-group-detail:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const group = new URL(request.url).searchParams.get("group")?.trim()
    if (!group) {
      return new NextResponse("Missing group", { status: 400 })
    }

    const supabase = getServerSupabase()
    const [membersResponse, checkinsResponse] = await Promise.all([
      supabase
        .from("members")
        .select("id, name, first_name, last_name, birthdate, email, is_trial, is_approved, base_group")
        .eq("base_group", group),
      supabase.from("checkins").select("id, member_id, group_name, date, time").eq("group_name", group),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (checkinsResponse.error) throw checkinsResponse.error

    return NextResponse.json({
      members: membersResponse.data ?? [],
      checkins: checkinsResponse.data ?? [],
    })
  } catch (error) {
    console.error("admin group detail failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
