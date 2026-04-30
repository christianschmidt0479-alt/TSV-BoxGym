import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin, sanitizeTextInput } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type RoleFlags = {
  isCompetitionMember: boolean
  isPerformanceGroup: boolean
  isTrial: boolean
}

type ScanMemberResponse = {
  found: boolean
  id: string | null
  name: string | null
  group: string | null
  status: string | null
  roleFlags: RoleFlags
}

function emptyResult(): ScanMemberResponse {
  return {
    found: false,
    id: null,
    name: null,
    group: null,
    status: null,
    roleFlags: {
      isCompetitionMember: false,
      isPerformanceGroup: false,
      isTrial: false,
    },
  }
}

function buildStatus(member: {
  member_qr_active: boolean | null
  is_approved: boolean | null
}) {
  if (member.member_qr_active === false) {
    return "QR deaktiviert"
  }

  return member.is_approved ? "Freigegeben" : "Nicht freigegeben"
}

function buildName(member: {
  first_name: string | null
  last_name: string | null
  name: string | null
}) {
  const first = member.first_name?.trim() ?? ""
  const last = member.last_name?.trim() ?? ""
  const fullName = `${first} ${last}`.trim()
  return fullName || member.name?.trim() || "Unbekannt"
}

function isPerformanceGroup(group: string | null) {
  const value = group?.toLowerCase() ?? ""
  return value.includes("leistung") || value.includes("wettkampf")
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || (session.role !== "admin" && session.role !== "trainer")) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-scan-member-qr:${getRequestIp(request)}`, 60, 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as { token?: unknown }
    const token = sanitizeTextInput(body.token, { maxLength: 64 })
    if (!token) {
      return NextResponse.json({ error: "Token fehlt." }, { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("members")
      .select("id, name, first_name, last_name, base_group, is_approved, is_trial, is_competition_member, member_qr_active")
      .eq("member_qr_token", token)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return NextResponse.json(emptyResult())
    }

    const response: ScanMemberResponse = {
      found: true,
      id: data.id,
      name: buildName(data),
      group: data.base_group?.trim() || null,
      status: buildStatus(data),
      roleFlags: {
        isCompetitionMember: Boolean(data.is_competition_member),
        isPerformanceGroup: isPerformanceGroup(data.base_group ?? null),
        isTrial: Boolean(data.is_trial),
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("admin scan-member-qr failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
