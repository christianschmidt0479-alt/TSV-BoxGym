import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type TrainerCompetitionProfileBody = {
  memberId: string
  hasCompetitionPass: boolean
  competitionLicenseNumber?: string
  competitionTargetWeight?: number
  lastMedicalExamDate?: string
  competitionFights?: number
  competitionWins?: number
  competitionLosses?: number
  competitionDraws?: number
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
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = checkRateLimit(`trainer-competition-profile:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as TrainerCompetitionProfileBody
    const supabase = getServerSupabase()
    const hasPass = !!body.hasCompetitionPass

    const updatePayload: Record<string, unknown> = {
      has_competition_pass: hasPass,
      is_competition_member: hasPass ? undefined : false,
      competition_license_number: hasPass ? body.competitionLicenseNumber?.trim() || null : null,
      last_medical_exam_date: hasPass ? body.lastMedicalExamDate || null : null,
      competition_fights: hasPass ? body.competitionFights ?? 0 : 0,
      competition_wins: hasPass ? body.competitionWins ?? 0 : 0,
      competition_losses: hasPass ? body.competitionLosses ?? 0 : 0,
      competition_draws: hasPass ? body.competitionDraws ?? 0 : 0,
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
      action: "member_competition_profile_saved",
      targetType: "member",
      targetId: data.id,
      targetName: getMemberDisplayName(data),
      details: hasPass ? "Wettkampfpass und Daten gepflegt" : "Wettkampfpass entfernt",
    })

    return NextResponse.json({ ok: true, member: data })
  } catch (error) {
    console.error("trainer competition profile failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
