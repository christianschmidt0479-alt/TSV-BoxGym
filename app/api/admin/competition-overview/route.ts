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
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = checkRateLimit(`admin-competition-overview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [membersResponse, weightsResponse] = await Promise.all([
      supabase.from("members").select("*").order("last_name", { ascending: true }).order("first_name", { ascending: true }),
      supabase
        .from("checkins")
        .select("member_id, weight, created_at, group_name")
        .not("weight", "is", null)
        .order("created_at", { ascending: false }),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (weightsResponse.error) throw weightsResponse.error

    return NextResponse.json({
      members: membersResponse.data ?? [],
      weightRows: weightsResponse.data ?? [],
    })
  } catch (error) {
    console.error("admin competition overview failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
