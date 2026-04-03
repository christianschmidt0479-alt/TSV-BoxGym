import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

const GS_CONFIRMATION_YES_PREFIX = "gs_confirmed:"
const GS_CONFIRMATION_NO_PREFIX = "gs_rejected:"

function isMissingColumnError(error: { message?: string; code?: string; details?: string } | null, column: string) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return error?.code === "PGRST204" || message.includes(column.toLowerCase())
}

function isMissingAuditLogTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("admin_audit_log")
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

type PendingMemberRow = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  birthdate?: string | null
  gender?: string | null
  email?: string | null
  email_verified?: boolean | null
  email_verified_at?: string | null
  email_verification_token?: string | null
  phone?: string | null
  guardian_name?: string | null
  is_trial?: boolean | null
  is_approved?: boolean | null
  base_group?: string | null
  office_list_status?: string | null
  office_list_group?: string | null
  office_list_checked_at?: string | null
}

async function loadPendingMembers(supabase: ReturnType<typeof getServerSupabase>) {
  const baseSelect =
    "id, name, first_name, last_name, birthdate, email, email_verified, email_verified_at, email_verification_token, phone, guardian_name, is_trial, is_approved, base_group"
  const optionalColumns = ["gender", "office_list_status", "office_list_group", "office_list_checked_at"] as const
  const selectedOptionalColumns = [...optionalColumns] as string[]

  while (true) {
    const response = await supabase
      .from("members")
      .select([baseSelect, ...selectedOptionalColumns].join(", "))
      .eq("is_approved", false)
      .order("created_at", { ascending: false })

    if (!response.error) {
      const rows = ((response.data ?? []) as unknown) as PendingMemberRow[]
      return {
        data: rows.map((row) => ({
          ...row,
          gender: row.gender ?? null,
          office_list_status: row.office_list_status ?? null,
          office_list_group: row.office_list_group ?? null,
          office_list_checked_at: row.office_list_checked_at ?? null,
        })),
        error: null,
      }
    }

    const missingColumn = optionalColumns.find((column) => isMissingColumnError(response.error, column)) ?? null
    if (!missingColumn) {
      return response
    }

    const nextIndex = selectedOptionalColumns.indexOf(missingColumn)
    if (nextIndex === -1) {
      return response
    }

    selectedOptionalColumns.splice(nextIndex, 1)
  }
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

    const rateLimit = await checkRateLimitAsync(`admin-pending-overview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [pendingMembersResponse, checkinsResponse] = await Promise.all([
      loadPendingMembers(supabase),
      supabase.from("checkins").select("member_id"),
    ])

    if (pendingMembersResponse.error) throw pendingMembersResponse.error
    if (checkinsResponse.error) throw checkinsResponse.error

    const pendingMemberIds = (pendingMembersResponse.data ?? []).map((row) => row.id).filter(Boolean)
    const gsConfirmedAtByMemberId: Record<string, string> = {}
    const gsRejectedAtByMemberId: Record<string, string> = {}

    for (const row of pendingMembersResponse.data ?? []) {
      if (typeof row.email_verification_token !== "string") {
        continue
      }

      if (row.email_verification_token.startsWith(GS_CONFIRMATION_YES_PREFIX)) {
        gsConfirmedAtByMemberId[row.id] = row.email_verification_token.slice(GS_CONFIRMATION_YES_PREFIX.length)
      }

      if (row.email_verification_token.startsWith(GS_CONFIRMATION_NO_PREFIX)) {
        gsRejectedAtByMemberId[row.id] = row.email_verification_token.slice(GS_CONFIRMATION_NO_PREFIX.length)
      }
    }

    if (pendingMemberIds.length > 0) {
      const { data: confirmationLogs, error: confirmationLogsError } = await supabase
        .from("admin_audit_log")
        .select("target_id, action, created_at")
        .in("action", ["member_gs_confirmation_confirmed", "member_gs_confirmation_rejected"])
        .eq("target_type", "member")
        .in("target_id", pendingMemberIds)
        .order("created_at", { ascending: false })

      if (confirmationLogsError && !isMissingAuditLogTableError(confirmationLogsError)) {
        throw confirmationLogsError
      }

      for (const row of confirmationLogs ?? []) {
        if (!row.target_id || gsConfirmedAtByMemberId[row.target_id] || gsRejectedAtByMemberId[row.target_id]) {
          continue
        }

        if (row.action === "member_gs_confirmation_confirmed") {
          gsConfirmedAtByMemberId[row.target_id] = row.created_at as string
        }

        if (row.action === "member_gs_confirmation_rejected") {
          gsRejectedAtByMemberId[row.target_id] = row.created_at as string
        }
      }
    }

    return NextResponse.json({
      pendingMembers: (pendingMembersResponse.data ?? []).map((row) => {
        const normalizedRow = {
          ...row,
          base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
        }

        delete normalizedRow.email_verification_token
        return normalizedRow
      }),
      checkinRows: checkinsResponse.data ?? [],
      gsConfirmedAtByMemberId,
      gsRejectedAtByMemberId,
    })
  } catch (error) {
    console.error("admin pending overview failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
