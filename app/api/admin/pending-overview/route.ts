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

    const rateLimit = checkRateLimit(`admin-pending-overview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [pendingMembersResponse, checkinsResponse] = await Promise.all([
      supabase
        .from("members")
        .select("id, name, first_name, last_name, birthdate, email, email_verified, email_verified_at, phone, guardian_name, is_trial, is_approved, base_group")
        .eq("is_approved", false)
        .order("created_at", { ascending: false }),
      supabase.from("checkins").select("member_id"),
    ])

    if (pendingMembersResponse.error) throw pendingMembersResponse.error
    if (checkinsResponse.error) throw checkinsResponse.error

    return NextResponse.json({
      pendingMembers: pendingMembersResponse.data ?? [],
      checkinRows: checkinsResponse.data ?? [],
    })
  } catch (error) {
    console.error("admin pending overview failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
