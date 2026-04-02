import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { isInternalTrainerTestEmail } from "@/lib/trainerAdmin"
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
      role: "trainer" | "admin"
    }

const MEMBER_ROLE_SELECT =
  "id, name, first_name, last_name, birthdate, email, base_group, is_approved, is_competition_member, has_competition_pass, competition_license_number, last_medical_exam_date, competition_fights, competition_wins, competition_losses, competition_draws"
const TRAINER_ROLE_BASE_SELECT =
  "id, first_name, last_name, email, email_verified, email_verified_at, is_approved, approved_at, created_at"
const TRAINER_ROLE_OPTIONAL_COLUMNS = [
  "phone",
  "trainer_license",
  "role",
  "linked_member_id",
  "trainer_license_renewals",
  "lizenzart",
  "lizenznummer",
  "lizenz_gueltig_bis",
  "lizenz_verband",
  "bemerkung",
] as const

type ErrorWithDetails = {
  message?: string
  details?: string | null
}

type TrainerRoleRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  email_verified: boolean | null
  email_verified_at: string | null
  is_approved: boolean | null
  approved_at: string | null
  created_at: string | null
  phone: string | null
  trainer_license: string | null
  linked_member_id: string | null
  trainer_license_renewals: string[]
  lizenzart: string | null
  lizenznummer: string | null
  lizenz_gueltig_bis: string | null
  lizenz_verband: string | null
  bemerkung: string | null
  role: "trainer" | "admin"
}

function jsonError(message: string, status: number, details?: string) {
  return NextResponse.json({ ok: false, error: message, ...(details ? { details } : {}) }, { status })
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

async function requireAdminSession(request: Request) {
  if (!isAllowedOrigin(request)) {
    return jsonError("Forbidden", 403)
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session || session.accountRole !== "admin") {
    return jsonError("Unauthorized", 401)
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

function isMissingColumnError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")
  )
}

function findMissingColumn(error: ErrorWithDetails | null) {
  const message = error?.message?.toLowerCase() ?? ""
  // try simple match first
  const simple = TRAINER_ROLE_OPTIONAL_COLUMNS.find((column) => message.includes(column))
  if (simple) return simple

  // more robust checks: message may include table-qualified names or different phrasing
  const details = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  for (const column of TRAINER_ROLE_OPTIONAL_COLUMNS) {
    if (details.includes(`.${column}`) || details.includes(` ${column}`) || details.includes(`${column} `)) return column
  }

  return null
}

function getNullableString(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "string" ? row[key] : null
}

async function loadTrainerRowsWithFallback(supabase: ReturnType<typeof getServerSupabase>) {
  const optionalColumns = [...TRAINER_ROLE_OPTIONAL_COLUMNS] as string[]

  while (true) {
    const select = [TRAINER_ROLE_BASE_SELECT, ...optionalColumns].join(", ")
    const response = await supabase
      .from("trainer_accounts")
      .select(select)
      .order("created_at", { ascending: false })

    if (!response.error) {
      const rows = (response.data ?? []) as unknown as Array<Record<string, unknown>>
      return {
        data: rows
          .map((row): TrainerRoleRow => ({
            ...row,
            id: typeof row.id === "string" ? row.id : "",
            first_name: typeof row.first_name === "string" ? row.first_name : null,
            last_name: typeof row.last_name === "string" ? row.last_name : null,
            email: "email" in row ? (typeof row.email === "string" ? row.email : null) : null,
            email_verified: typeof row.email_verified === "boolean" ? row.email_verified : null,
            email_verified_at: typeof row.email_verified_at === "string" ? row.email_verified_at : null,
            is_approved: typeof row.is_approved === "boolean" ? row.is_approved : null,
            approved_at: typeof row.approved_at === "string" ? row.approved_at : null,
            created_at: typeof row.created_at === "string" ? row.created_at : null,
            phone: getNullableString(row, "phone"),
            trainer_license: getNullableString(row, "trainer_license"),
            linked_member_id: getNullableString(row, "linked_member_id"),
            lizenzart: getNullableString(row, "lizenzart"),
            lizenznummer: getNullableString(row, "lizenznummer"),
            lizenz_gueltig_bis: getNullableString(row, "lizenz_gueltig_bis"),
            lizenz_verband: getNullableString(row, "lizenz_verband"),
            bemerkung: getNullableString(row, "bemerkung"),
            trainer_license_renewals: Array.isArray(row.trainer_license_renewals)
              ? row.trainer_license_renewals.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              : [],
            role: row.role === "admin" ? "admin" : "trainer",
          }))
          .filter((row) => !isInternalTrainerTestEmail(row.email)),
        error: null,
      }
    }

    const missingColumn = isMissingColumnError(response.error) ? findMissingColumn(response.error) : null
    if (!missingColumn) throw response.error

    const nextIndex = optionalColumns.indexOf(missingColumn)
    if (nextIndex === -1) throw response.error
    optionalColumns.splice(nextIndex, 1)
  }
}

export async function GET(request: Request) {
  try {
    const authError = await requireAdminSession(request)
    if (authError) return authError

    const rateLimit = await checkRateLimitAsync(`admin-person-roles:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const supabase = getServerSupabase()
    const [membersResponse, trainersResponse] = await Promise.all([
      supabase
        .from("members")
        .select(MEMBER_ROLE_SELECT)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
      loadTrainerRowsWithFallback(supabase),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (trainersResponse.error) throw trainersResponse.error

    return NextResponse.json({
      members: (Array.isArray(membersResponse.data) ? membersResponse.data : []).map((row) => ({
        ...row,
        base_group: normalizeTrainingGroup(row.base_group) || row.base_group,
      })),
      trainers: Array.isArray(trainersResponse.data) ? trainersResponse.data : [],
    })
  } catch (error) {
    console.error("admin person roles get failed", error)
    return jsonError("Internal server error", 500)
  }
}

export async function POST(request: Request) {
  try {
    const authError = await requireAdminSession(request)
    if (authError) return authError
    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return jsonError("Unauthorized", 401)
    }

    const rateLimit = await checkRateLimitAsync(`admin-person-roles-action:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    let body: PersonRolesActionBody | null = null
    try {
      body = (await request.json()) as PersonRolesActionBody
    } catch {
      body = null
    }
    if (!body || typeof body !== "object" || !("action" in body) || typeof body.action !== "string") {
      return jsonError("Invalid request body", 400)
    }
    const supabase = getServerSupabase()

    if (body.action === "approve_member") {
      const memberId = parseRecordId(body.memberId)
      if (!memberId) {
        return jsonError("Missing member id", 400)
      }

      const { data, error } = await supabase
        .from("members")
        .update({ is_approved: true })
        .eq("id", memberId)
        .select("id, name, first_name, last_name, email")
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return jsonError("Member not found", 404)
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
        return jsonError("Missing trainer id", 400)
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
        return jsonError("Trainer not found", 404)
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
      if (!trainerId || (body.role !== "admin" && body.role !== "trainer")) {
        return jsonError("Invalid trainer role payload", 400)
      }

      const { data, error } = await supabase
        .from("trainer_accounts")
        .update({ role: body.role })
        .eq("id", trainerId)
        .select("id, first_name, last_name, email")
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return jsonError("Trainer not found", 404)
      }

      await writeAdminAuditLog({
        session,
        action: body.role === "admin" ? "trainer_promoted_to_admin" : "trainer_role_reset",
        targetType: "trainer",
        targetId: data.id,
        targetName: getDisplayName(data),
        details: `E-Mail: ${data.email}, Rolle: ${body.role}`,
      })

      return NextResponse.json({ ok: true })
    }

    return jsonError("Unsupported action", 400)
  } catch (error) {
    console.error("admin person roles action failed", error)
    return jsonError("Internal server error", 500)
  }
}
