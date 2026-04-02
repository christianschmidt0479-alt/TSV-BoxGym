import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

const MEMBER_OVERVIEW_BASE_SELECT =
  "id, name, first_name, last_name, birthdate, email, email_verified, email_verified_at, phone, guardian_name, has_competition_pass, is_competition_member, competition_license_number, last_medical_exam_date, competition_fights, competition_wins, competition_losses, competition_draws, is_trial, is_approved, base_group"
const MEMBER_OVERVIEW_OPTIONAL_COLUMNS = ["competition_target_weight", "needs_trainer_assist_checkin"] as const
const TRAINER_LINK_OPTIONAL_COLUMNS = ["linked_member_id", "role"] as const
const TRAINER_LINK_BASE_SELECT = "id, email, is_approved"

function jsonError(message: string, status: number, details?: string) {
  return NextResponse.json({ ok: false, error: message, ...(details ? { details } : {}) }, { status })
}

function isMissingColumnError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")
  )
}

function findMissingColumn<TColumn extends readonly string[]>(error: { message?: string } | null, columns: TColumn) {
  const message = error?.message?.toLowerCase() ?? ""
  return columns.find((column) => message.includes(column)) ?? null
}

async function loadMembersWithFallback(supabase: ReturnType<typeof getServerSupabase>) {
  const optionalColumns = [...MEMBER_OVERVIEW_OPTIONAL_COLUMNS] as string[]

  while (true) {
    const select = [MEMBER_OVERVIEW_BASE_SELECT, ...optionalColumns].join(", ")
    const response = await supabase.from("members").select(select).order("last_name", { ascending: true }).order("first_name", { ascending: true })

    if (!response.error) {
      const rows = (response.data ?? []) as unknown as Array<Record<string, unknown>>
      return {
        data: rows.map((row) => ({
          ...row,
          competition_target_weight: "competition_target_weight" in row ? row.competition_target_weight ?? null : null,
          needs_trainer_assist_checkin: "needs_trainer_assist_checkin" in row ? row.needs_trainer_assist_checkin ?? false : false,
        })),
        error: null,
      }
    }

    const missingColumn = isMissingColumnError(response.error)
      ? findMissingColumn(response.error, MEMBER_OVERVIEW_OPTIONAL_COLUMNS)
      : null

    if (!missingColumn) throw response.error

    const nextIndex = optionalColumns.indexOf(missingColumn)
    if (nextIndex === -1) throw response.error
    optionalColumns.splice(nextIndex, 1)
  }
}

async function loadTrainerLinksWithFallback(supabase: ReturnType<typeof getServerSupabase>) {
  const optionalColumns = [...TRAINER_LINK_OPTIONAL_COLUMNS] as string[]

  while (true) {
    const select = [TRAINER_LINK_BASE_SELECT, ...optionalColumns].join(", ")
    const response = await supabase.from("trainer_accounts").select(select)

    if (!response.error) {
      const rows = (response.data ?? []) as unknown as Array<Record<string, unknown>>
      return {
        data: rows.map((row) => ({
          ...row,
          linked_member_id: "linked_member_id" in row ? row.linked_member_id ?? null : null,
          role: row.role === "admin" ? "admin" : "trainer",
        })),
        error: null,
      }
    }

    const missingColumn = isMissingColumnError(response.error)
      ? findMissingColumn(response.error, TRAINER_LINK_OPTIONAL_COLUMNS)
      : null

    if (!missingColumn) throw response.error

    const nextIndex = optionalColumns.indexOf(missingColumn)
    if (nextIndex === -1) throw response.error
    optionalColumns.splice(nextIndex, 1)
  }
}

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return jsonError("Forbidden", 403)
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return jsonError("Unauthorized", 401)
    }

    const rateLimit = await checkRateLimitAsync(`admin-members-overview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const supabase = getServerSupabase()
    const [membersResponse, checkinsResponse, parentLinksResponse, trainersResponse] = await Promise.all([
      loadMembersWithFallback(supabase),
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
      loadTrainerLinksWithFallback(supabase),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (checkinsResponse.error) throw checkinsResponse.error
    if (parentLinksResponse.error) throw parentLinksResponse.error
    if (trainersResponse.error) throw trainersResponse.error

    const parentLinkRows = Array.isArray(parentLinksResponse.data) ? (parentLinksResponse.data as Array<Record<string, unknown>>) : []
    const parentLinks = parentLinkRows.map((row) => ({
      ...row,
      parent_accounts: Array.isArray(row.parent_accounts)
        ? row.parent_accounts[0] ?? null
        : row.parent_accounts ?? null,
    }))

    const memberRows = (membersResponse.data ?? []) as Array<Record<string, unknown>>

    return NextResponse.json({
      members: memberRows.map((row) => {
        const baseGroup = typeof row.base_group === "string" ? row.base_group : null
        return {
          ...row,
          base_group: normalizeTrainingGroup(baseGroup) || baseGroup,
        }
      }),
      checkinRows: Array.isArray(checkinsResponse.data) ? checkinsResponse.data : [],
      parentLinks,
      trainerLinks: Array.isArray(trainersResponse.data) ? trainersResponse.data : [],
    })
  } catch (error) {
    console.error("admin members overview failed", error)
    return jsonError("Internal server error", 500)
  }
}
