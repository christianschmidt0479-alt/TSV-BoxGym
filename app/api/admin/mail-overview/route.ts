import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getManualAdminMailDrafts, isManualAdminMailRecord } from "@/lib/manualAdminMailOutboxDb"
import { getManualParentMailDrafts, isManualParentMailRecord } from "@/lib/manualParentMailOutboxDb"
import { getParentFamilyMailRows } from "@/lib/parentMailDrafts"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

function isMissingContextKeyError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "42703" || message.includes("context_key")
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

    const rateLimit = await checkRateLimitAsync(`admin-mail-overview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [adminQueueResponse, parentFamilyMailRows, manualParentOutboxRows, manualAdminOutboxRows] = await Promise.all([
      supabase
        .from("admin_notification_queue")
        .select("id, kind, member_name, email, group_name, created_at, sent_at")
        .is("sent_at", null)
        .order("created_at", { ascending: false }),
      getParentFamilyMailRows(),
      getManualParentMailDrafts(),
      getManualAdminMailDrafts(),
    ])

    const outgoingQueueWithContextResponse = await supabase
      .from("outgoing_mail_queue")
      .select("id, purpose, email, name, context_key, created_at, sent_at")
      .is("sent_at", null)
      .order("created_at", { ascending: false })

    const outgoingQueueResponse =
      outgoingQueueWithContextResponse.error && isMissingContextKeyError(outgoingQueueWithContextResponse.error)
        ? await supabase
        .from("outgoing_mail_queue")
        .select("id, purpose, email, name, created_at, sent_at")
        .is("sent_at", null)
        .order("created_at", { ascending: false })
        : outgoingQueueWithContextResponse

    if (adminQueueResponse.error) throw adminQueueResponse.error
    if (outgoingQueueResponse.error) throw outgoingQueueResponse.error

    return NextResponse.json({
      adminQueueRows: adminQueueResponse.data ?? [],
      outgoingQueueRows: (outgoingQueueResponse.data ?? []).filter((row) => !isManualParentMailRecord(row) && !isManualAdminMailRecord(row)),
      parentFamilyMailRows,
      manualParentOutboxRows,
      manualAdminOutboxRows,
    })
  } catch (error) {
    console.error("admin mail overview failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
