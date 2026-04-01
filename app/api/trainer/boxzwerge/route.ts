import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`trainer-boxzwerge:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const today = new URL(request.url).searchParams.get("today")?.trim()
    if (!today || !DATE_PATTERN.test(today)) {
      return new NextResponse("Missing today", { status: 400 })
    }

    const supabase = getServerSupabase()
    const [membersResponse, checkinsResponse] = await Promise.all([
      supabase
        .from("members")
        .select("id, name, first_name, last_name, birthdate, email, phone, guardian_name, is_approved, base_group")
        .eq("base_group", "Boxzwerge")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
      supabase.from("checkins").select("id, member_id, date, created_at").eq("group_name", "Boxzwerge").eq("date", today),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (checkinsResponse.error) throw checkinsResponse.error

    return NextResponse.json({
      members: membersResponse.data ?? [],
      todayCheckins: checkinsResponse.data ?? [],
    })
  } catch (error) {
    console.error("trainer boxzwerge failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
