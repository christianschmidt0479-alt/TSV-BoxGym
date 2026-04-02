import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

const TRAINER_COMPETITION_MEMBER_SELECT =
  "id, name, first_name, last_name, birthdate, email, phone, base_group, has_competition_pass, is_competition_member, competition_license_number, competition_target_weight, last_medical_exam_date, competition_fights, competition_wins, competition_losses, competition_draws"

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`trainer-competition:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [membersResponse, weightsResponse] = await Promise.all([
      supabase.from("members").select(TRAINER_COMPETITION_MEMBER_SELECT).order("last_name", { ascending: true }).order("first_name", { ascending: true }),
      supabase
        .from("checkins")
        .select("member_id, weight, created_at, date, group_name")
        .not("weight", "is", null)
        .order("created_at", { ascending: false }),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (weightsResponse.error) throw weightsResponse.error

    return NextResponse.json({
      members: membersResponse.data ?? [],
      weightRows: weightsResponse.data ?? [],
      viewerRole: session.accountRole,
    })
  } catch (error) {
    console.error("trainer competition failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
