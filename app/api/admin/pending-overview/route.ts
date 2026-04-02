import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

const GS_CONFIRMATION_TOKEN_PREFIX = "gs_confirmed:"

function isMissingAuditLogTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("admin_audit_log")
}

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

    const rateLimit = await checkRateLimitAsync(`admin-pending-overview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [pendingMembersResponse, checkinsResponse] = await Promise.all([
      supabase
        .from("members")
        .select("id, name, first_name, last_name, birthdate, email, email_verified, email_verified_at, email_verification_token, phone, guardian_name, is_trial, is_approved, base_group")
        .eq("is_approved", false)
        .order("created_at", { ascending: false }),
      supabase.from("checkins").select("member_id"),
    ])

    if (pendingMembersResponse.error) throw pendingMembersResponse.error
    if (checkinsResponse.error) throw checkinsResponse.error

    const pendingMemberIds = (pendingMembersResponse.data ?? []).map((row) => row.id).filter(Boolean)
    const gsConfirmedAtByMemberId: Record<string, string> = {}

    for (const row of pendingMembersResponse.data ?? []) {
      if (typeof row.email_verification_token !== "string") {
        continue
      }

      if (row.email_verification_token.startsWith(GS_CONFIRMATION_TOKEN_PREFIX)) {
        gsConfirmedAtByMemberId[row.id] = row.email_verification_token.slice(GS_CONFIRMATION_TOKEN_PREFIX.length)
      }
    }

    if (pendingMemberIds.length > 0) {
      const { data: confirmationLogs, error: confirmationLogsError } = await supabase
        .from("admin_audit_log")
        .select("target_id, created_at")
        .eq("action", "member_gs_confirmation_confirmed")
        .eq("target_type", "member")
        .in("target_id", pendingMemberIds)
        .order("created_at", { ascending: false })

      if (confirmationLogsError && !isMissingAuditLogTableError(confirmationLogsError)) {
        throw confirmationLogsError
      }

      for (const row of confirmationLogs ?? []) {
        if (!row.target_id || gsConfirmedAtByMemberId[row.target_id]) {
          continue
        }

        gsConfirmedAtByMemberId[row.target_id] = row.created_at as string
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
    })
  } catch (error) {
    console.error("admin pending overview failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
