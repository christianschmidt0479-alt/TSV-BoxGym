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

    const rateLimit = checkRateLimit(`trainer-members:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const memberId = new URL(request.url).searchParams.get("memberId")?.trim()
    const supabase = getServerSupabase()

    if (memberId) {
      const attendanceResponse = await supabase
        .from("checkins")
        .select("id, member_id, group_name, date, time, created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })

      if (attendanceResponse.error) throw attendanceResponse.error

      return NextResponse.json({
        attendanceRows: attendanceResponse.data ?? [],
      })
    }

    const membersResponse = await supabase
      .from("members")
      .select("id, name, first_name, last_name, birthdate, email, phone, base_group, is_trial")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })

    if (membersResponse.error) throw membersResponse.error

    return NextResponse.json({
      members: membersResponse.data ?? [],
    })
  } catch (error) {
    console.error("trainer members failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
