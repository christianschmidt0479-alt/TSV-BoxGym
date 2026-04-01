import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { hashAuthSecret } from "@/lib/authSecret"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { isValidPin, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { sendAccessCodeChangedEmail, sendApprovalEmail, sendVerificationEmail } from "@/lib/resendClient"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { parseTrainingGroup } from "@/lib/trainingGroups"

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

const MEMBER_ADMIN_SELECT =
  "id, name, first_name, last_name, birthdate, gender, email, email_verified, email_verified_at, phone, guardian_name, has_competition_pass, is_competition_member, competition_license_number, competition_target_weight, last_medical_exam_date, competition_fights, competition_wins, competition_losses, competition_draws, is_trial, is_approved, base_group, needs_trainer_assist_checkin"

function sanitizeMemberForAdmin(member: Record<string, unknown>) {
  const sanitized = { ...member }
  delete sanitized.member_pin
  delete sanitized.email_verification_token
  return sanitized
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-member-action:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as MemberActionBody
    const supabase = getServerSupabase()

    if (body.action === "approve") {
      const approvedGroup = parseTrainingGroup(body.baseGroup)
      if (!approvedGroup) {
        return new NextResponse("Bitte eine gueltige Stammgruppe auswaehlen.", { status: 400 })
      }
      const updatePayload: Record<string, unknown> = {
        is_approved: true,
        base_group: approvedGroup,
      }

      if (body.newPin?.trim()) {
        if (!isValidPin(body.newPin.trim())) {
          return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
        }
        updatePayload.member_pin = await hashAuthSecret(body.newPin.trim())
      }

      const { data, error } = await supabase
        .from("members")
        .update(updatePayload)
        .eq("id", body.memberId)
        .select(MEMBER_ADMIN_SELECT)
        .single()

      if (error) throw error

      if (body.newPin?.trim() && data.email) {
        await sendAccessCodeChangedEmail({
          email: data.email,
          name: getMemberDisplayName(data),
          kind: "member",
        })
      }

      if (data.email) {
        await sendApprovalEmail({
          email: data.email,
          name: getMemberDisplayName(data),
          kind: "member",
          group: approvedGroup,
        })
      }

      await writeAdminAuditLog({
        session,
        action: "member_approved",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: `Gruppe: ${approvedGroup}`,
      })

      return NextResponse.json({ ok: true, member: { ...sanitizeMemberForAdmin(data as Record<string, unknown>), base_group: approvedGroup } })
    }

    if (body.action === "resend_verification") {
      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, name, first_name, last_name, email, email_verified, email_verification_token")
        .eq("id", body.memberId)
        .single()

      if (memberError) throw memberError
      if (!member) {
        return new NextResponse("Mitglied nicht gefunden", { status: 404 })
      }

      if (!member.email) {
        return new NextResponse("Mitglied hat keine E-Mail-Adresse", { status: 400 })
      }

      if (member.email_verified) {
        return new NextResponse("E-Mail wurde bereits bestätigt", { status: 400 })
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
      const verificationLink = `${verificationBaseUrl}/mein-bereich?verify=${verificationToken}`

      await sendVerificationEmail({
        email: member.email,
        name: getMemberDisplayName(member),
        link: verificationLink,
        kind: "member",
      })

      await writeAdminAuditLog({
        session,
        action: "member_verification_resent",
        targetType: "member",
        targetId: member.id,
        targetName: getMemberDisplayName(member),
        details: `Verification email resent to ${member.email}`,
      })

      return NextResponse.json({ ok: true })
    }

    if (body.action === "change_group") {
      const nextGroup = parseTrainingGroup(body.baseGroup)
      if (!nextGroup) {
        return new NextResponse("Bitte eine gueltige Stammgruppe auswaehlen.", { status: 400 })
      }
      const { data, error } = await supabase
        .from("members")
        .update({ base_group: nextGroup })
        .eq("id", body.memberId)
        .select(MEMBER_ADMIN_SELECT)
        .single()

      if (error) throw error
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
      const newPin = body.newPin.trim()
      if (!isValidPin(newPin)) {
        return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      const { data, error } = await supabase
        .from("members")
        .update({ member_pin: await hashAuthSecret(newPin) })
        .eq("id", body.memberId)
        .select(MEMBER_ADMIN_SELECT)
        .single()

      if (error) throw error

      await writeAdminAuditLog({
        session,
        action: "member_pin_reset",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: "PIN aktualisiert",
      })

      return NextResponse.json({ ok: true, member: sanitizeMemberForAdmin(data as Record<string, unknown>) })
    }

    if (body.action === "update_name") {
      const firstName = body.firstName.trim()
      const lastName = body.lastName.trim()
      if (!firstName || !lastName) {
        return new NextResponse("Vorname und Nachname duerfen nicht leer sein.", { status: 400 })
      }

      const { data, error } = await supabase
        .from("members")
        .update({
          first_name: firstName,
          last_name: lastName,
          name: `${firstName} ${lastName}`.trim(),
        })
        .eq("id", body.memberId)
        .select(MEMBER_ADMIN_SELECT)
        .single()

      if (error) throw error

      await writeAdminAuditLog({
        session,
        action: "member_name_changed",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: "Name aktualisiert",
      })

      return NextResponse.json({ ok: true, member: sanitizeMemberForAdmin(data as Record<string, unknown>) })
    }

    if (body.action === "set_competition") {
      const updatePayload: Record<string, unknown> = {
        is_competition_member: body.isCompetitionMember,
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

      let { data, error } = await supabase
        .from("members")
        .update(updatePayload)
        .eq("id", body.memberId)
        .select(MEMBER_ADMIN_SELECT)
        .single()

      if (error && isMissingColumnError(error) && "competition_target_weight" in updatePayload) {
        delete updatePayload.competition_target_weight
        const retry = await supabase.from("members").update(updatePayload).eq("id", body.memberId).select(MEMBER_ADMIN_SELECT).single()
        data = retry.data
        error = retry.error
      }

      if (error) throw error
      if (!data) {
        throw new Error("Member update returned no data")
      }
      await writeAdminAuditLog({
        session,
        action: "member_competition_changed",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: body.isCompetitionMember ? "Wettkampfliste aktiv" : "Wettkampfliste inaktiv",
      })
      return NextResponse.json({ ok: true, member: sanitizeMemberForAdmin(data as Record<string, unknown>) })
    }

    if (body.action === "set_trainer_assist") {
      const { data, error } = await supabase
        .from("members")
        .update({
          needs_trainer_assist_checkin: body.needsTrainerAssistCheckin,
        })
        .eq("id", body.memberId)
        .select(MEMBER_ADMIN_SELECT)
        .single()

      if (error) throw error
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

    return new NextResponse("Invalid action", { status: 400 })
  } catch (error) {
    console.error("admin member action failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
