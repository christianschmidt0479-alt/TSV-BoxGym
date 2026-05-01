import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { hashAuthSecret } from "@/lib/authSecret"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { isValidMemberPassword, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/memberPassword"
import { hashParentAccessCode } from "@/lib/parentAccountsDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup, parseTrainingGroup } from "@/lib/trainingGroups"

function isMissingColumnError(error: { message?: string; code?: string; details?: string } | null, column: string) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return error?.code === "PGRST204" || message.includes(column.toLowerCase())
}

type MemberProfileBody =
  | {
      action: "save_profile"
      memberId: string
      firstName?: string
      lastName?: string
      birthdate?: string
      gender?: string
      baseGroup?: string
      email?: string
      phone?: string
      guardianName?: string
      memberPin?: string
      parent?: {
        name: string
        email: string
        phone?: string
        accessCode?: string
      } | null
    }
  | {
      action: "unlink_parent"
      memberId: string
    }
  | {
      action: "delete_member"
      memberId: string
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

function sanitizeMemberForAdmin(member: Record<string, unknown>) {
  const sanitized = { ...member }
  delete sanitized.member_pin
  delete sanitized.email_verification_token
  return sanitized
}

async function saveMemberProfile(
  supabase: ReturnType<typeof getServerSupabase>,
  body: Extract<MemberProfileBody, { action: "save_profile" }>,
  nextValues: {
    firstName?: string | null
    lastName?: string | null
    fullName?: string | null
    birthdate?: string | null
    gender?: string | null
    baseGroup?: string | null
    memberPin?: string
  }
) {
  const baseUpdate: Record<string, unknown> = {
    first_name: nextValues.firstName,
    last_name: nextValues.lastName,
    name: nextValues.fullName,
    birthdate: nextValues.birthdate,
    phone: body.phone?.trim() || null,
    guardian_name: body.guardianName?.trim() || null,
    member_pin: nextValues.memberPin ? await hashAuthSecret(nextValues.memberPin) : undefined,
  }

  if (typeof body.email === "string") {
    const trimmedEmail = body.email.trim()
    if (trimmedEmail) {
      baseUpdate.email = trimmedEmail
    }
  }

  const withGender = await supabase
    .from("members")
    .update({
      ...baseUpdate,
      gender: nextValues.gender,
      base_group: nextValues.baseGroup,
    })
    .eq("id", body.memberId)
    .select("id, name, first_name, last_name, birthdate, gender, email, email_verified, email_verified_at, phone, guardian_name, has_competition_pass, is_competition_member, competition_license_number, competition_target_weight, last_medical_exam_date, competition_fights, competition_wins, competition_losses, competition_draws, is_trial, is_approved, base_group")
    .single()

  if (!withGender.error || !isMissingColumnError(withGender.error, "gender")) {
    return withGender
  }

  const withoutGender = await supabase
    .from("members")
    .update({
      ...baseUpdate,
      base_group: nextValues.baseGroup,
    })
    .eq("id", body.memberId)
    .select("id, name, first_name, last_name, birthdate, email, email_verified, email_verified_at, phone, guardian_name, has_competition_pass, is_competition_member, competition_license_number, competition_target_weight, last_medical_exam_date, competition_fights, competition_wins, competition_losses, competition_draws, is_trial, is_approved, base_group")
    .single()

  return {
    data: withoutGender.data ? { ...withoutGender.data, gender: null } : null,
    error: withoutGender.error,
  }
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

    const rateLimit = await checkRateLimitAsync(`admin-member-profile:${getRequestIp(request)}`, 40, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as MemberProfileBody
    const supabase = getServerSupabase()

    if (body.action === "save_profile") {
      if (typeof body.email === "string" && !body.email.trim()) {
        return new NextResponse("E-Mail darf nicht leer sein", { status: 400 })
      }

      const memberPin = body.memberPin?.trim() || ""
      if (memberPin && !isValidMemberPassword(memberPin)) {
        return new NextResponse(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, { status: 400 })
      }
      const parentPassword = body.parent?.accessCode?.trim() || ""
      if (parentPassword && !isValidMemberPassword(parentPassword)) {
        return new NextResponse(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      const nextFirstName = "firstName" in body ? body.firstName?.trim() || null : undefined
      const nextLastName = "lastName" in body ? body.lastName?.trim() || null : undefined
      const nextBirthdate = "birthdate" in body ? body.birthdate?.trim() || null : undefined
      const nextGender = "gender" in body ? body.gender?.trim() || null : undefined
      const nextBaseGroup = "baseGroup" in body ? parseTrainingGroup(body.baseGroup) || null : undefined
      const nextFullName = nextFirstName !== undefined || nextLastName !== undefined
        ? `${nextFirstName ?? ""} ${nextLastName ?? ""}`.trim() || null
        : undefined

      const { data: member, error: memberError } = await saveMemberProfile(supabase, body, {
        firstName: nextFirstName,
        lastName: nextLastName,
        fullName: nextFullName,
        birthdate: nextBirthdate,
        gender: nextGender,
        baseGroup: nextBaseGroup,
        memberPin,
      })

      if (memberError) throw memberError
      if (!member) throw new Error("Mitglied nicht gefunden")

      let parentLink: {
        parent_account_id: string
        parent_name: string
        email: string
        phone?: string | null
      } | null = null

      if (body.parent?.email?.trim() && body.parent?.name?.trim()) {
        const { data: parentAccount, error: parentError } = await supabase
          .from("parent_accounts")
          .upsert(
            {
              parent_name: body.parent.name.trim(),
              email: body.parent.email.trim().toLowerCase(),
              phone: body.parent.phone?.trim() || null,
              access_code_hash: body.parent.accessCode?.trim() ? await hashParentAccessCode(body.parent.accessCode) : undefined,
            },
            { onConflict: "email" }
          )
          .select("id, parent_name, email, phone")
          .single()

        if (parentError) throw parentError

        const { error: linkError } = await supabase
          .from("parent_account_members")
          .upsert(
            {
              parent_account_id: parentAccount.id,
              member_id: body.memberId,
            },
            { onConflict: "parent_account_id,member_id" }
          )

        if (linkError) throw linkError

        parentLink = {
          parent_account_id: parentAccount.id,
          parent_name: parentAccount.parent_name,
          email: parentAccount.email,
          phone: parentAccount.phone,
        }
      }

      await writeAdminAuditLog({
        session,
        action: "member_profile_saved",
        targetType: "member",
        targetId: member.id,
        targetName: getMemberDisplayName(member),
        details: [
          "Kontaktdaten oder Elternkonto angepasst",
          memberPin ? "Mitgliedspasswort aktualisiert" : "",
          body.parent?.accessCode?.trim() ? "Eltern-Passwort aktualisiert" : "",
        ].filter(Boolean).join(", "),
      })

      return NextResponse.json({
        ok: true,
        member: {
          ...sanitizeMemberForAdmin(member as Record<string, unknown>),
          base_group: normalizeTrainingGroup(member.base_group) || member.base_group,
        },
        parentLink,
      })
    }

    if (body.action === "unlink_parent") {
      const { data: member } = await supabase.from("members").select("id, name, first_name, last_name").eq("id", body.memberId).maybeSingle()
      const { error } = await supabase.from("parent_account_members").delete().eq("member_id", body.memberId)
      if (error) throw error
      await writeAdminAuditLog({
        session,
        action: "member_parent_unlinked",
        targetType: "member",
        targetId: body.memberId,
        targetName: member ? getMemberDisplayName(member) : null,
        details: "Elternkonto getrennt",
      })
      return NextResponse.json({ ok: true })
    }

    if (body.action === "delete_member") {
      const { data: member } = await supabase.from("members").select("id, name, first_name, last_name").eq("id", body.memberId).maybeSingle()
      const { error: checkinsError } = await supabase.from("checkins").delete().eq("member_id", body.memberId)
      if (checkinsError) throw checkinsError

      await supabase.from("parent_account_members").delete().eq("member_id", body.memberId)

      const { error: memberError } = await supabase.from("members").delete().eq("id", body.memberId)
      if (memberError) throw memberError

      await writeAdminAuditLog({
        session,
        action: "member_deleted",
        targetType: "member",
        targetId: body.memberId,
        targetName: member ? getMemberDisplayName(member) : null,
        details: "Mitglied vollständig gelöscht",
      })

      return NextResponse.json({ ok: true })
    }

    return new NextResponse("Invalid action", { status: 400 })
  } catch (error) {
    console.error("admin member profile failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
