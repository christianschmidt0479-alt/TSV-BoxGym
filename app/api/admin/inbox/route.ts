import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { isManualParentMailRecord } from "@/lib/manualParentMailOutboxDb"
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

    const rateLimit = await checkRateLimitAsync(`admin-inbox:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [pendingMembersResponse, trainersResponse, membersResponse, adminQueueResponse, outgoingQueueResponse] = await Promise.all([
      supabase
        .from("members")
        .select("id, name, first_name, last_name, birthdate, email, email_verified, base_group")
        .eq("is_trial", false)
        .eq("is_approved", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("trainer_accounts")
        .select("id, first_name, last_name, email, phone, trainer_license, email_verified, is_approved, role, linked_member_id, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("members")
        .select("id, name, first_name, last_name, birthdate, base_group")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
      supabase
        .from("admin_notification_queue")
        .select("id, kind, member_name, created_at")
        .is("sent_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("outgoing_mail_queue")
        .select("id, purpose, name, email, created_at")
        .is("sent_at", null)
        .order("created_at", { ascending: false }),
    ])

    if (pendingMembersResponse.error) throw pendingMembersResponse.error
    if (trainersResponse.error) throw trainersResponse.error
    if (membersResponse.error) throw membersResponse.error
    if (adminQueueResponse.error) throw adminQueueResponse.error
    if (outgoingQueueResponse.error) throw outgoingQueueResponse.error

    return NextResponse.json({
      pendingMembers: pendingMembersResponse.data ?? [],
      trainers: trainersResponse.data ?? [],
      members: membersResponse.data ?? [],
      adminQueueRows: adminQueueResponse.data ?? [],
      outgoingQueueRows: (outgoingQueueResponse.data ?? []).filter((row) => !isManualParentMailRecord(row)),
    })
  } catch (error) {
    console.error("admin inbox failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
