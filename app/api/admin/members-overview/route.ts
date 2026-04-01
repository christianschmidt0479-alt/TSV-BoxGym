import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

const MEMBER_OVERVIEW_SELECT =
  "id, name, first_name, last_name, birthdate, gender, email, email_verified, email_verified_at, phone, guardian_name, has_competition_pass, is_competition_member, competition_license_number, competition_target_weight, last_medical_exam_date, competition_fights, competition_wins, competition_losses, competition_draws, is_trial, is_approved, base_group, needs_trainer_assist_checkin"

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = checkRateLimit(`admin-members-overview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [membersResponse, checkinsResponse, parentLinksResponse, trainersResponse] = await Promise.all([
      supabase.from("members").select(MEMBER_OVERVIEW_SELECT).order("last_name", { ascending: true }).order("first_name", { ascending: true }),
      supabase.from("checkins").select("member_id, created_at, date").order("created_at", { ascending: false }),
      supabase.from("parent_child_links").select(`
        member_id,
        parent_account_id,
        parent_accounts (
          id,
          parent_name,
          email,
          phone
        )
      `),
      supabase.from("trainer_accounts").select("id, linked_member_id, email, role, is_approved"),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (checkinsResponse.error) throw checkinsResponse.error
    if (parentLinksResponse.error) throw parentLinksResponse.error
    if (trainersResponse.error) throw trainersResponse.error

    const parentLinks = ((parentLinksResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      parent_accounts: Array.isArray(row.parent_accounts)
        ? row.parent_accounts[0] ?? null
        : row.parent_accounts ?? null,
    }))

    return NextResponse.json({
      members: (membersResponse.data ?? []).map((row) => ({
        ...row,
        base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
      })),
      checkinRows: checkinsResponse.data ?? [],
      parentLinks,
      trainerLinks: trainersResponse.data ?? [],
    })
  } catch (error) {
    console.error("admin members overview failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
