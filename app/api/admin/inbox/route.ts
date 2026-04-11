import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { isManualAdminMailRecord } from "@/lib/manualAdminMailOutboxDb"
// Eltern-Mail-Logik entfernt
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

function isMissingSchemaEntity(error: { message?: string; details?: string; code?: string } | null, name?: string) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  const looksMissing =
    error?.code === "PGRST204" ||
    error?.code === "42P01" ||
    error?.code === "42703" ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")

  if (!looksMissing) return false
  if (!name) return true
  return message.includes(name.toLowerCase())
}

async function getPendingMembers(supabase: ReturnType<typeof getServerSupabase>) {
  const withEmailVerified = await supabase
    .from("members")
    .select("id, name, first_name, last_name, birthdate, email, email_verified, base_group")
    .eq("is_trial", false)
    .eq("is_approved", false)
    .order("created_at", { ascending: false })

  if (!withEmailVerified.error || !isMissingSchemaEntity(withEmailVerified.error, "email_verified")) {
    return withEmailVerified
  }

  const fallback = await supabase
    .from("members")
    .select("id, name, first_name, last_name, birthdate, email, base_group")
    .eq("is_trial", false)
    .eq("is_approved", false)
    .order("created_at", { ascending: false })

  if (fallback.error) return fallback

  return {
    ...fallback,
    data: (fallback.data ?? []).map((row) => ({ ...row, email_verified: false })),
  }
}

async function getTrainerAccounts(supabase: ReturnType<typeof getServerSupabase>) {
  const response = await supabase
    .from("trainer_accounts")
    .select("id, first_name, last_name, email, phone, trainer_license, email_verified, is_approved, role, linked_member_id, created_at")
    .order("created_at", { ascending: false })

  if (response.error && isMissingSchemaEntity(response.error, "trainer_accounts")) {
    return { data: [], error: null }
  }

  if (response.error && isMissingSchemaEntity(response.error)) {
    const fallback = await supabase
      .from("trainer_accounts")
      .select("id, first_name, last_name, email, phone, is_approved, created_at")
      .order("created_at", { ascending: false })

    if (fallback.error) return fallback

    return {
      ...fallback,
      data: (fallback.data ?? []).map((row) => ({
        ...row,
        trainer_license: null,
        email_verified: false,
        role: "trainer",
        linked_member_id: null,
      })),
    }
  }

  return response
}

async function getAdminNotificationQueue(supabase: ReturnType<typeof getServerSupabase>) {
  const response = await supabase
    .from("admin_notification_queue")
    .select("id, kind, member_name, created_at")
    .is("sent_at", null)
    .order("created_at", { ascending: false })

  if (response.error && isMissingSchemaEntity(response.error, "admin_notification_queue")) {
    return { data: [], error: null }
  }

  return response
}

async function getOutgoingMailQueue(supabase: ReturnType<typeof getServerSupabase>) {
  const response = await supabase
    .from("outgoing_mail_queue")
    .select("id, purpose, name, email, created_at")
    .is("sent_at", null)
    .order("created_at", { ascending: false })

  if (response.error && isMissingSchemaEntity(response.error, "outgoing_mail_queue")) {
    return { data: [], error: null }
  }

  return response
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
      getPendingMembers(supabase),
      getTrainerAccounts(supabase),
      supabase
        .from("members")
        .select("id, name, first_name, last_name, birthdate, base_group")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
      getAdminNotificationQueue(supabase),
      getOutgoingMailQueue(supabase),
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
      outgoingQueueRows: (outgoingQueueResponse.data ?? []).filter((row) => !isManualAdminMailRecord(row)),
    })
  } catch (error) {
    console.error("admin inbox failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
