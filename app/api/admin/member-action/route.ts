import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { sendAccessCodeChangedEmail, sendApprovalEmail, sendVerificationEmail } from "@/lib/resendClient"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

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

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = checkRateLimit(`admin-member-action:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as MemberActionBody
    const supabase = getServerSupabase()

    if (body.action === "approve") {
      const updatePayload: Record<string, unknown> = {
        is_approved: true,
        base_group: body.baseGroup,
      }

      if (body.newPin?.trim()) {
        updatePayload.member_pin = body.newPin.trim()
      }

      const { data, error } = await supabase
        .from("members")
        .update(updatePayload)
        .eq("id", body.memberId)
        .select("*")
        .single()

      if (error) throw error

      const kind = data.base_group === "Boxzwerge" ? "boxzwerge" : "member"
      if (body.newPin?.trim() && data.email) {
        await sendAccessCodeChangedEmail({
          email: data.email,
          name: getMemberDisplayName(data),
          kind,
        })
      }

      if (data.email) {
        await sendApprovalEmail({
          email: data.email,
          name: getMemberDisplayName(data),
          kind,
          group: body.baseGroup,
        })
      }

      await writeAdminAuditLog({
        session,
        action: "member_approved",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: `Gruppe: ${body.baseGroup}`,
      })

      return NextResponse.json({ ok: true, member: data })
    }

    if (body.action === "resend_verification") {
      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("*")
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
      const kind = member.base_group === "Boxzwerge" ? "boxzwerge" : "member"

      await sendVerificationEmail({
        email: member.email,
        name: getMemberDisplayName(member),
        link: verificationLink,
        kind,
      })

      await writeAdminAuditLog({
        session,
        action: "member_verification_resent",
        targetType: "member",
        targetId: member.id,
        targetName: getMemberDisplayName(member),
        details: `Verification email resent to ${member.email}`,
      })

      return NextResponse.json({ ok: true, emailVerificationToken: verificationToken })
    }

    if (body.action === "change_group") {
      const { data, error } = await supabase
        .from("members")
        .update({ base_group: body.baseGroup })
        .eq("id", body.memberId)
        .select("*")
        .single()

      if (error) throw error
      await writeAdminAuditLog({
        session,
        action: "member_group_changed",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: `Neue Gruppe: ${body.baseGroup}`,
      })
      return NextResponse.json({ ok: true, member: data })
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
        .select("*")
        .single()

      if (error && isMissingColumnError(error) && "competition_target_weight" in updatePayload) {
        delete updatePayload.competition_target_weight
        const retry = await supabase.from("members").update(updatePayload).eq("id", body.memberId).select("*").single()
        data = retry.data
        error = retry.error
      }

      if (error) throw error
      await writeAdminAuditLog({
        session,
        action: "member_competition_changed",
        targetType: "member",
        targetId: data.id,
        targetName: getMemberDisplayName(data),
        details: body.isCompetitionMember ? "Wettkampfliste aktiv" : "Wettkampfliste inaktiv",
      })
      return NextResponse.json({ ok: true, member: data })
    }

    if (body.action === "set_trainer_assist") {
      const { data, error } = await supabase
        .from("members")
        .update({
          needs_trainer_assist_checkin: body.needsTrainerAssistCheckin,
        })
        .eq("id", body.memberId)
        .select("*")
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
      return NextResponse.json({ ok: true, member: data })
    }

    return new NextResponse("Invalid action", { status: 400 })
  } catch (error) {
    console.error("admin member action failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
