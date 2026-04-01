import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

type PersonRolesActionBody =
  | {
      action: "approve_member"
      memberId: string
    }
  | {
      action: "approve_trainer"
      trainerId: string
    }
  | {
      action: "set_trainer_role"
      trainerId: string
      role: "admin"
    }

const MEMBER_ROLE_SELECT =
  "id, name, first_name, last_name, email, base_group, is_approved, is_competition_member"
const TRAINER_ROLE_SELECT =
  "id, first_name, last_name, email, trainer_license, email_verified, email_verified_at, is_approved, approved_at, role, linked_member_id, created_at"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

async function requireAdminSession(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session || session.accountRole !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  return null
}

function parseRecordId(value: string | undefined) {
  const normalized = value?.trim() ?? ""
  return normalized || null
}

function getDisplayName(input?: {
  first_name?: string | null
  last_name?: string | null
  name?: string | null
}) {
  const full = `${input?.first_name ?? ""} ${input?.last_name ?? ""}`.trim()
  return full || input?.name || "—"
}

export async function GET(request: Request) {
  try {
    const authError = await requireAdminSession(request)
    if (authError) return authError

    const rateLimit = await checkRateLimitAsync(`admin-person-roles:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [membersResponse, trainersResponse] = await Promise.all([
      supabase
        .from("members")
        .select(MEMBER_ROLE_SELECT)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
      supabase
        .from("trainer_accounts")
        .select(TRAINER_ROLE_SELECT)
        .order("created_at", { ascending: false }),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (trainersResponse.error) throw trainersResponse.error

    return NextResponse.json({
      members: (membersResponse.data ?? []).map((row) => ({
        ...row,
        base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
      })),
      trainers: trainersResponse.data ?? [],
    })
  } catch (error) {
    console.error("admin person roles get failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requireAdminSession(request)
    if (authError) return authError
    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-person-roles-action:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as PersonRolesActionBody
    const supabase = getServerSupabase()

    if (body.action === "approve_member") {
      const memberId = parseRecordId(body.memberId)
      if (!memberId) {
        return new NextResponse("Missing member id", { status: 400 })
      }

      const { data, error } = await supabase
        .from("members")
        .update({ is_approved: true })
        .eq("id", memberId)
        .select("id, name, first_name, last_name, email")
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return new NextResponse("Member not found", { status: 404 })
      }

      await writeAdminAuditLog({
        session,
        action: "member_approved",
        targetType: "member",
        targetId: data.id,
        targetName: getDisplayName(data),
        details: data.email ? `E-Mail: ${data.email}` : "Ohne E-Mail",
      })

      return NextResponse.json({ ok: true })
    }

    if (body.action === "approve_trainer") {
      const trainerId = parseRecordId(body.trainerId)
      if (!trainerId) {
        return new NextResponse("Missing trainer id", { status: 400 })
      }

      const { data, error } = await supabase
        .from("trainer_accounts")
        .update({
          is_approved: true,
          approved_at: new Date().toISOString(),
        })
        .eq("id", trainerId)
        .select("id, first_name, last_name, email")
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return new NextResponse("Trainer not found", { status: 404 })
      }

      await writeAdminAuditLog({
        session,
        action: "trainer_approved",
        targetType: "trainer",
        targetId: data.id,
        targetName: getDisplayName(data),
        details: `E-Mail: ${data.email}`,
      })

      return NextResponse.json({ ok: true })
    }

    if (body.action === "set_trainer_role") {
      const trainerId = parseRecordId(body.trainerId)
      if (!trainerId || body.role !== "admin") {
        return new NextResponse("Invalid trainer role payload", { status: 400 })
      }

      const { data, error } = await supabase
        .from("trainer_accounts")
        .update({ role: body.role })
        .eq("id", trainerId)
        .select("id, first_name, last_name, email")
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return new NextResponse("Trainer not found", { status: 404 })
      }

      await writeAdminAuditLog({
        session,
        action: "trainer_promoted_to_admin",
        targetType: "trainer",
        targetId: data.id,
        targetName: getDisplayName(data),
        details: `E-Mail: ${data.email}`,
      })

      return NextResponse.json({ ok: true })
    }

    return new NextResponse("Unsupported action", { status: 400 })
  } catch (error) {
    console.error("admin person roles action failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
