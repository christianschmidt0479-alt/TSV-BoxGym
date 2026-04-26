import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { hashAuthSecret } from "@/lib/authSecret"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { ensureMemberAuthUserLink } from "@/lib/memberAuthLink"
import { isValidMemberPassword, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/memberPassword"
import { sendVerificationEmail } from "@/lib/resendClient"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup, parseTrainingGroup } from "@/lib/trainingGroups"

type MemberActionBody =
  | {
      action: "approve"
      memberId: string
      baseGroup: string
      newPin?: string
    }
  | {
      action: "resend_verification"
      memberId: string
    }
  | {
      action: "change_group"
      memberId: string
      baseGroup: string
    }
  | {
      action: "reset_pin"
      memberId: string
      newPin: string
    }
  | {
      action: "update_name"
      memberId: string
      firstName: string
      lastName: string
    }
  | {
      action: "set_competition"
      memberId: string
      isCompetitionMember: boolean
      hasCompetitionPass?: boolean
      competitionLicenseNumber?: string
      competitionTargetWeight?: number
      lastMedicalExamDate?: string
      competitionFights?: number
      competitionWins?: number
      competitionLosses?: number
      competitionDraws?: number
    }
  | {
      action: "set_trainer_assist"
      memberId: string
      needsTrainerAssistCheckin: boolean
    }

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

function getMemberDisplayName(member: {
  first_name?: string | null
  last_name?: string | null
  name?: string | null
}) {
  const full = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return full || member.name || "—"
}

function generateEmailVerificationToken() {
  return randomUUID()
}

function isMissingColumnError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")
  )
}

const MEMBER_ADMIN_BASE_SELECT =
  "id, name, first_name, last_name, birthdate, email, email_verified, email_verified_at, phone, guardian_name, has_competition_pass, is_competition_member, competition_license_number, last_medical_exam_date, competition_fights, competition_wins, competition_losses, competition_draws, is_trial, is_approved, base_group, member_phase"
const MEMBER_ADMIN_OPTIONAL_COLUMNS = ["competition_target_weight", "needs_trainer_assist_checkin"] as const
type MemberAdminRow = Record<string, unknown> & {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  name?: string | null
}

function sanitizeMemberForAdmin(member: Record<string, unknown>) {
  const sanitized = { ...member }
  delete sanitized.member_pin
  delete sanitized.email_verification_token
  return sanitized
}

function jsonError(message: string, status: number, details?: string) {
  return NextResponse.json({ ok: false, error: message, ...(details ? { details } : {}) }, { status })
}

function findMissingMemberColumn(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return MEMBER_ADMIN_OPTIONAL_COLUMNS.find((column) => message.includes(column)) ?? null
}

function normalizeMemberRow(row: Record<string, unknown>) {
  return ({
    ...row,
    competition_target_weight: "competition_target_weight" in row ? row.competition_target_weight ?? null : null,
    needs_trainer_assist_checkin: "needs_trainer_assist_checkin" in row ? row.needs_trainer_assist_checkin ?? false : false,
  } as unknown) as MemberAdminRow
}

async function updateMemberWithFallback(
  supabase: ReturnType<typeof getServerSupabase>,
  memberId: string,
  updatePayload: Record<string, unknown>
) {
  const optionalColumns = [...MEMBER_ADMIN_OPTIONAL_COLUMNS] as string[]

  while (true) {
    const select = [MEMBER_ADMIN_BASE_SELECT, ...optionalColumns].join(", ")
    const response = await supabase.from("members").update(updatePayload).eq("id", memberId).select(select).maybeSingle()

    if (!response.error) {
      const row = response.data ? normalizeMemberRow(response.data as unknown as Record<string, unknown>) : null
      return { data: row, error: null }
    }

    const missingColumn = isMissingColumnError(response.error) ? findMissingMemberColumn(response.error) : null
    if (!missingColumn) {
      return { data: null, error: response.error }
    }

    const nextIndex = optionalColumns.indexOf(missingColumn)
    if (nextIndex === -1) {
      return { data: null, error: response.error }
    }
    optionalColumns.splice(nextIndex, 1)
  }
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return jsonError("Forbidden", 403)
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return jsonError("Unauthorized", 401)
    }

    const rateLimit = await checkRateLimitAsync(`admin-member-action:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    let body: MemberActionBody | null = null
    try {
      body = (await request.json()) as MemberActionBody
    } catch {
      body = null
    }
    if (!body || typeof body !== "object" || !("action" in body) || typeof body.action !== "string") {
      return jsonError("Invalid request body", 400)
    }
    const supabase = getServerSupabase()

    if (body.action === "approve") {
      if (typeof body.memberId !== "string" || typeof body.baseGroup !== "string") {
        return jsonError("Invalid approve payload", 400)
      }
      const approvedGroup = parseTrainingGroup(body.baseGroup)
      if (!approvedGroup) {
        return jsonError("Bitte eine gültige Stammgruppe auswählen.", 400)
      }

      const { data: preApproveCheck, error: preApproveError } = await supabase
        .from("members")
        .select("id, email_verified")
        .eq("id", body.memberId)
        .maybeSingle()

      if (preApproveError) throw preApproveError
      if (!preApproveCheck) return jsonError("Mitglied nicht gefunden", 404)
      if (!preApproveCheck.email_verified) {
        // TEMP LIVE MONITORING
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[admin-flow][approve][blocked] reason=email_not_verified id=${body.memberId}`)
        }
        return jsonError("Die E-Mail-Adresse wurde noch nicht bestätigt. Freigabe erst nach E-Mail-Bestätigung möglich.", 400)
      }

      const updatePayload: Record<string, unknown> = {
        is_approved: true,
        is_trial: false,
        member_phase: "member",
        base_group: approvedGroup,
      }

      if (body.newPin?.trim()) {
        if (!isValidMemberPassword(body.newPin.trim())) {
          return new NextResponse(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, { status: 400 })
        }
        updatePayload.member_pin = await hashAuthSecret(body.newPin.trim())
      }

      const { data, error } = await updateMemberWithFallback(supabase, body.memberId, updatePayload)

      if (error) throw error
      if (!data) return jsonError("Mitglied nicht gefunden", 404)

      await ensureMemberAuthUserLink({
        memberId: data.id,
        email: typeof data.email === "string" ? data.email : null,
        password: body.newPin?.trim() || null,
        emailVerified: Boolean(data.email_verified),
      })

      await writeAdminAuditLog({
        session,
        action: "member_approved",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: `Gruppe: ${approvedGroup}`,
      })

      // TEMP LIVE MONITORING
      if (process.env.NODE_ENV !== "production") {
        console.info(`[admin-flow][approve][success] id=${data.id} group=${approvedGroup}`)
      }

      return NextResponse.json({ ok: true, member: { ...sanitizeMemberForAdmin(data as Record<string, unknown>), base_group: approvedGroup } })
    }

    if (body.action === "resend_verification") {
      if (typeof body.memberId !== "string") {
        return jsonError("Invalid resend verification payload", 400)
      }
      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, name, first_name, last_name, email, email_verified, email_verification_token, member_pin")
        .eq("id", body.memberId)
        .single()

      if (memberError) throw memberError
      if (!member) {
        return jsonError("Mitglied nicht gefunden", 404)
      }

      if (!member.email) {
        return jsonError("Mitglied hat keine E-Mail-Adresse", 400)
      }

      const verificationToken = member.email_verification_token || generateEmailVerificationToken()

      if (!member.email_verification_token) {
        const { error: tokenError } = await supabase
          .from("members")
          .update({ email_verification_token: verificationToken })
          .eq("id", member.id)

        if (tokenError) throw tokenError
      }

      const verificationBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
      const hasPassword = Boolean(member.member_pin)
      const verificationLink = hasPassword
        ? `${verificationBaseUrl}/mein-bereich?verify=${verificationToken}`
        : `${verificationBaseUrl}/mein-bereich/zugang-einrichten?token=${verificationToken}`

      const delivery = await sendVerificationEmail({
        email: member.email,
        name: getMemberDisplayName(member),
        link: verificationLink,
        kind: "member",
      })

      // Update last_verification_sent_at — optional column, ignore if column doesn't exist yet
      try {
        await supabase
          .from("members")
          .update({ last_verification_sent_at: new Date().toISOString() })
          .eq("id", member.id)
      } catch {
        // column not yet deployed — safe to ignore
      }

      await writeAdminAuditLog({
        session,
        action: "member_verification_resent",
        targetType: "member",
        targetId: member.id,
        targetName: getMemberDisplayName(member),
        details: `Verification email resent to ${member.email}`,
      })

      return NextResponse.json({
        ok: true,
        verificationLink,
        delivery,
      })
    }

    if (body.action === "change_group") {
      if (typeof body.memberId !== "string" || typeof body.baseGroup !== "string") {
        return jsonError("Invalid change group payload", 400)
      }
      const nextGroup = parseTrainingGroup(body.baseGroup)
      if (!nextGroup) {
        return jsonError("Bitte eine gültige Stammgruppe auswählen.", 400)
      }
      const { data, error } = await updateMemberWithFallback(supabase, body.memberId, { base_group: nextGroup })

      if (error) throw error
      if (!data) return jsonError("Mitglied nicht gefunden", 404)
      await writeAdminAuditLog({
        session,
        action: "member_group_changed",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: `Neue Gruppe: ${nextGroup}`,
      })
      return NextResponse.json({ ok: true, member: { ...sanitizeMemberForAdmin(data as Record<string, unknown>), base_group: nextGroup } })
    }

    if (body.action === "reset_pin") {
      if (typeof body.memberId !== "string" || typeof body.newPin !== "string") {
        return jsonError("Invalid reset password payload", 400)
      }
      const newPin = body.newPin.trim()
      if (!isValidMemberPassword(newPin)) {
        return jsonError(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, 400)
      }

      const { data, error } = await updateMemberWithFallback(supabase, body.memberId, {
        member_pin: await hashAuthSecret(newPin),
      })

      if (error) throw error
      if (!data) return jsonError("Mitglied nicht gefunden", 404)

      await writeAdminAuditLog({
        session,
        action: "member_pin_reset",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: "Passwort aktualisiert",
      })

      return NextResponse.json({ ok: true, member: sanitizeMemberForAdmin(data as Record<string, unknown>) })
    }


    if (body.action === "set_competition") {
      if (typeof body.memberId !== "string" || typeof body.isCompetitionMember !== "boolean") {
        return jsonError("Invalid competition payload", 400)
      }
      const { data: currentMember, error: currentMemberError } = await supabase
        .from("members")
        .select("id, base_group")
        .eq("id", body.memberId)
        .maybeSingle()

      if (currentMemberError) throw currentMemberError
      if (!currentMember) {
        return jsonError("Mitglied nicht gefunden", 404)
      }

      const nextIsCompetitionMember =
        body.isCompetitionMember

      const updatePayload: Record<string, unknown> = {
        is_competition_member: nextIsCompetitionMember,
        has_competition_pass: body.hasCompetitionPass ?? false,
        competition_license_number: body.competitionLicenseNumber?.trim() || null,
        last_medical_exam_date: body.lastMedicalExamDate || null,
        competition_fights: body.competitionFights ?? 0,
        competition_wins: body.competitionWins ?? 0,
        competition_losses: body.competitionLosses ?? 0,
        competition_draws: body.competitionDraws ?? 0,
      }

      if (body.competitionTargetWeight !== undefined) {
        updatePayload.competition_target_weight = body.competitionTargetWeight
      }

      const { data, error } = await updateMemberWithFallback(supabase, body.memberId, updatePayload)

      if (error) throw error
      if (!data) return jsonError("Mitglied nicht gefunden", 404)
      await writeAdminAuditLog({
        session,
        action: "member_competition_changed",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: nextIsCompetitionMember ? "Wettkampfliste aktiv" : "Wettkampfliste inaktiv",
      })
      return NextResponse.json({ ok: true, member: sanitizeMemberForAdmin(data as Record<string, unknown>) })
    }

    if (body.action === "set_trainer_assist") {
      if (typeof body.memberId !== "string" || typeof body.needsTrainerAssistCheckin !== "boolean") {
        return jsonError("Invalid trainer assist payload", 400)
      }
      const { data, error } = await updateMemberWithFallback(supabase, body.memberId, {
        needs_trainer_assist_checkin: body.needsTrainerAssistCheckin,
      })

      if (error) throw error
      if (!data) return jsonError("Mitglied nicht gefunden", 404)
      await writeAdminAuditLog({
        session,
        action: "member_trainer_assist_changed",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: body.needsTrainerAssistCheckin ? "Trainerhilfe aktiv" : "Trainerhilfe aus",
      })
      return NextResponse.json({ ok: true, member: sanitizeMemberForAdmin(data as Record<string, unknown>) })
    }

    return jsonError("Invalid action", 400)
  }
  catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("admin member action failed", error)
    }
    return jsonError("Internal server error", 500)
  }
}
