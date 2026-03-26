import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { isValidPin, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type MemberProfileBody =
  | {
      action: "save_profile"
      memberId: string
      email?: string
      phone?: string
      guardianName?: string
      memberPin?: string
      parent?: {
        name: string
        email: string
        phone?: string
        accessCodeHash?: string
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

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = checkRateLimit(`admin-member-profile:${getRequestIp(request)}`, 40, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as MemberProfileBody
    const supabase = getServerSupabase()

    if (body.action === "save_profile") {
      const memberPin = body.memberPin?.trim() || ""
      if (memberPin && !isValidPin(memberPin)) {
        return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      const { data: member, error: memberError } = await supabase
        .from("members")
        .update({
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          guardian_name: body.guardianName?.trim() || null,
          member_pin: memberPin || undefined,
        })
        .eq("id", body.memberId)
        .select("*")
        .single()

      if (memberError) throw memberError

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
              access_code_hash: body.parent.accessCodeHash || undefined,
            },
            { onConflict: "email" }
          )
          .select("*")
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
        details: "Kontaktdaten oder Elternkonto angepasst",
      })

      return NextResponse.json({ ok: true, member, parentLink })
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
