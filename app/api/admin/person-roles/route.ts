import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { ensureMemberAuthUserLink } from "@/lib/memberAuthLink"
import { isInternalTrainerTestEmail } from "@/lib/trainerAdmin"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup, parseTrainingGroup } from "@/lib/trainingGroups"
import { createTrainerAccount } from "@/lib/trainerDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { sendVerificationEmail } from "@/lib/resendClient"

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
      action: "resend_trainer_verification"
      trainerId: string
    }
  | {
      action: "set_trainer_role"
      trainerId: string
      role: "trainer" | "admin"
    }
  | {
      action: "grant_trainer"
      memberId: string
      sendAccessMail?: boolean
    }
  | {
      action: "revoke_trainer"
      memberId?: string
      trainerId?: string
    }
  | {
      action: "ensure_sportler"
      memberId: string
      baseGroup?: string
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

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function makeTemporaryTrainerPassword() {
  return randomUUID().replace(/-/g, "").slice(0, 16)
}

async function ensureTrainerProfileExists(supabase: ReturnType<typeof getServerSupabase>, trainerId: string) {
  const { error } = await supabase
    .from("training_trainer_profiles")
    .upsert({ trainer_id: trainerId }, { onConflict: "trainer_id" })

  if (!error) return

  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase()
  const missingTable = message.includes("training_trainer_profiles") && message.includes("does not exist")
  if (!missingTable) {
    throw error
  }
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
        .select("id, name, first_name, last_name, email, email_verified")
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return jsonError("Member not found", 404)
      }

      await ensureMemberAuthUserLink({
        memberId: data.id,
        email: data.email,
        emailVerified: Boolean(data.email_verified),
      })

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

      const { data: preCheck, error: preCheckError } = await supabase
        .from("trainer_accounts")
        .select("id, email_verified")
        .eq("id", trainerId)
        .maybeSingle()

      if (preCheckError) throw preCheckError
      if (!preCheck) return jsonError("Trainer nicht gefunden", 404)
      if (!preCheck.email_verified) {
        return jsonError("Die E-Mail-Adresse wurde noch nicht bestätigt. Freigabe erst nach E-Mail-Bestätigung möglich.", 400)
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

    if (body.action === "resend_trainer_verification") {
      const trainerId = parseRecordId(body.trainerId)
      if (!trainerId) {
        return jsonError("Missing trainer id", 400)
      }

      const { data: trainer, error: trainerError } = await supabase
        .from("trainer_accounts")
        .select("id, first_name, last_name, email, email_verified, email_verification_token, password_hash")
        .eq("id", trainerId)
        .maybeSingle()

      if (trainerError) throw trainerError
      if (!trainer) return jsonError("Trainer nicht gefunden", 404)
      if (!trainer.email) return jsonError("Trainer hat keine E-Mail-Adresse", 400)
      if (trainer.email_verified) return jsonError("E-Mail wurde bereits bestätigt", 400)

      const hasPassword = Boolean(trainer.password_hash)
      const verificationToken = (trainer.email_verification_token as string | null)?.trim() || randomUUID()

      if (!trainer.email_verification_token) {
        const { error: tokenError } = await supabase
          .from("trainer_accounts")
          .update({ email_verification_token: verificationToken })
          .eq("id", trainerId)

        if (tokenError) throw tokenError
      }

      const verificationBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
      const verificationLink = hasPassword
        ? `${verificationBaseUrl}/trainer-zugang?trainer_verify=${verificationToken}`
        : `${verificationBaseUrl}/trainer-zugang/zugang-einrichten?token=${verificationToken}`

      const trainerName = getDisplayName(trainer as { first_name?: string | null; last_name?: string | null })
      const delivery = await sendVerificationEmail({
        email: trainer.email as string,
        name: trainerName,
        link: verificationLink,
        kind: "trainer",
      })

      await writeAdminAuditLog({
        session,
        action: "trainer_verification_resent",
        targetType: "trainer",
        targetId: trainerId,
        targetName: trainerName,
          details: `Verification email resent to ${trainer.email}`,
      })

      return NextResponse.json({ ok: true, verificationLink, delivery })
    }

    if (body.action === "grant_trainer") {
      const memberId = parseRecordId(body.memberId)
      if (!memberId) {
        return jsonError("Missing member id", 400)
      }

      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, first_name, last_name, name, email")
        .eq("id", memberId)
        .maybeSingle()

      if (memberError) throw memberError
      if (!member) return jsonError("Member not found", 404)

      const memberEmail = normalizeEmail(member.email)
      if (!memberEmail) {
        return jsonError("Mitglied hat keine gültige E-Mail-Adresse.", 400)
      }

      const { data: linkedTrainer, error: linkedTrainerError } = await supabase
        .from("trainer_accounts")
        .select("id, first_name, last_name, email, role, email_verified, is_approved, linked_member_id, email_verification_token")
        .eq("linked_member_id", memberId)
        .maybeSingle()

      if (linkedTrainerError) throw linkedTrainerError

      const { data: emailTrainer, error: emailTrainerError } = await supabase
        .from("trainer_accounts")
        .select("id, first_name, last_name, email, role, email_verified, is_approved, linked_member_id, email_verification_token")
        .eq("email", memberEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (emailTrainerError) throw emailTrainerError

      let trainerAccount: {
        id: string
        role: "trainer" | "admin" | null
        linked_member_id: string | null
      } | null = linkedTrainer ?? emailTrainer

      if (trainerAccount?.linked_member_id && trainerAccount.linked_member_id !== memberId) {
        return jsonError("Diese Trainer-E-Mail ist bereits mit einem anderen Mitglied verknüpft.", 409)
      }

      if (!trainerAccount) {
        const createdTrainer = await createTrainerAccount({
          first_name: member.first_name?.trim() || "Trainer",
          last_name: member.last_name?.trim() || member.name?.trim() || "Ohne Nachname",
          email: memberEmail,
          pin: makeTemporaryTrainerPassword(),
          linked_member_id: memberId,
          email_verification_token: randomUUID(),
          role: "trainer",
        })

        trainerAccount = {
          id: createdTrainer.id,
          role: createdTrainer.role === "admin" ? "admin" : createdTrainer.role === "trainer" ? "trainer" : null,
          linked_member_id: createdTrainer.linked_member_id ?? null,
        }
      }

      if (!trainerAccount) {
        return jsonError("Trainer account not found", 404)
      }

      const updatePayload: Record<string, unknown> = {
        linked_member_id: memberId,
        role: trainerAccount.role === "admin" ? "admin" : "trainer",
        is_approved: true,
        approved_at: new Date().toISOString(),
      }

      const { data: updatedTrainer, error: updateTrainerError } = await supabase
        .from("trainer_accounts")
        .update(updatePayload)
        .eq("id", trainerAccount.id)
        .select("id, first_name, last_name, email, email_verified, is_approved, email_verification_token")
        .maybeSingle()

      if (updateTrainerError) throw updateTrainerError
      if (!updatedTrainer) {
        return jsonError("Trainer account not found", 404)
      }

      await ensureTrainerProfileExists(supabase, updatedTrainer.id)

      let accessMailSent = false
      if (body.sendAccessMail === true && updatedTrainer.email && !updatedTrainer.email_verified) {
        let verificationToken = (updatedTrainer.email_verification_token as string | null)?.trim() || ""
        if (!verificationToken) {
          verificationToken = randomUUID()
          const { error: tokenUpdateError } = await supabase
            .from("trainer_accounts")
            .update({ email_verification_token: verificationToken })
            .eq("id", updatedTrainer.id)

          if (tokenUpdateError) throw tokenUpdateError
        }

        const verificationBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
        const verificationLink = `${verificationBaseUrl}/trainer-zugang/zugang-einrichten?token=${verificationToken}`

        await sendVerificationEmail({
          email: updatedTrainer.email,
          name: getDisplayName(updatedTrainer),
          link: verificationLink,
          kind: "trainer",
        })
        accessMailSent = true
      }

      await writeAdminAuditLog({
        session,
        action: "trainer_granted_from_member",
        targetType: "trainer",
        targetId: updatedTrainer.id,
        targetName: getDisplayName(updatedTrainer),
        details: `Mitglied: ${memberId}, Zugangsmail: ${accessMailSent ? "ja" : "nein"}`,
      })

      return NextResponse.json({ ok: true, trainerId: updatedTrainer.id, accessMailSent })
    }

    if (body.action === "revoke_trainer") {
      const memberId = parseRecordId(body.memberId)
      const trainerId = parseRecordId(body.trainerId)

      if (!memberId && !trainerId) {
        return jsonError("Missing member id or trainer id", 400)
      }

      const trainerQuery = supabase
        .from("trainer_accounts")
        .select("id, first_name, last_name, email, role")

      const { data: trainer, error: trainerError } = trainerId
        ? await trainerQuery.eq("id", trainerId).maybeSingle()
        : await trainerQuery.eq("linked_member_id", memberId as string).maybeSingle()

      if (trainerError) throw trainerError
      if (!trainer) {
        return jsonError("Kein passendes Trainerkonto gefunden.", 404)
      }

      if (trainer.role === "admin") {
        return jsonError("Admin-Konten können nicht über Trainerrolle entfernen angepasst werden.", 409)
      }

      const { error: revokeError } = await supabase
        .from("trainer_accounts")
        .update({ is_approved: false, approved_at: null })
        .eq("id", trainer.id)

      if (revokeError) throw revokeError

      await writeAdminAuditLog({
        session,
        action: "trainer_revoked_from_member",
        targetType: "trainer",
        targetId: trainer.id,
        targetName: getDisplayName(trainer),
        details: trainerId ? `Direkt über Trainer-ID: ${trainerId}` : `Mitglied: ${memberId}`,
      })

      return NextResponse.json({ ok: true })
    }

    if (body.action === "ensure_sportler") {
      const memberId = parseRecordId(body.memberId)
      if (!memberId) {
        return jsonError("Missing member id", 400)
      }

      const requestedBaseGroup = parseTrainingGroup(body.baseGroup)

      const memberResponse = requestedBaseGroup
        ? await supabase
            .from("members")
            .update({ base_group: requestedBaseGroup })
            .eq("id", memberId)
            .select("id, first_name, last_name, name, base_group")
            .maybeSingle()
        : await supabase
            .from("members")
            .select("id, first_name, last_name, name, base_group")
            .eq("id", memberId)
            .maybeSingle()

      const { data: member, error: memberError } = memberResponse

      if (memberError) throw memberError
      if (!member) {
        return jsonError("Member not found", 404)
      }

      await writeAdminAuditLog({
        session,
        action: "member_role_ensured",
        targetType: "member",
        targetId: member.id,
        targetName: getDisplayName(member),
        details: requestedBaseGroup ? `Stammgruppe gesetzt: ${requestedBaseGroup}` : "Rolle Sportler bestätigt",
      })

      return NextResponse.json({ ok: true, memberId: member.id, baseGroup: member.base_group ?? null })
    }

    if (body.action === "set_trainer_role") {
      const trainerId = parseRecordId(body.trainerId)
      if (!trainerId || (body.role !== "admin" && body.role !== "trainer")) {
        return jsonError("Invalid trainer role payload", 400)
      }

      const { data: currentTrainer, error: currentTrainerError } = await supabase
        .from("trainer_accounts")
        .select("id, role")
        .eq("id", trainerId)
        .maybeSingle()

      if (currentTrainerError) throw currentTrainerError
      if (!currentTrainer) {
        return jsonError("Trainer not found", 404)
      }

      if (currentTrainer.role === "admin" && body.role === "trainer") {
        const { count: otherAdmins, error: adminCountError } = await supabase
          .from("trainer_accounts")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .neq("id", trainerId)

        if (adminCountError) throw adminCountError
        if ((otherAdmins ?? 0) === 0) {
          return jsonError("Der letzte Admin kann nicht auf Trainer zurückgesetzt werden.", 409)
        }
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
