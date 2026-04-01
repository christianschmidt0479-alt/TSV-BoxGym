import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import {
  findMemberByEmail,
  findMemberByEmailAndPin,
  findMemberByFirstLastName,
  findMemberById,
  updateMemberProfile,
} from "@/lib/boxgymDb"
import {
  getChildrenForParent,
  getParentAccountByEmail,
  getParentAccountByLogin,
  hashParentAccessCode,
  isParentAccountSetupPending,
  type ParentAccountRow,
} from "@/lib/parentAccountsDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { isValidPin, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import {
  applyMemberAreaSessionCookie,
  applyParentAreaSessionCookie,
  clearMemberAreaSessionCookie,
  clearParentAreaSessionCookie,
  getPublicAreaSessionMaxAgeMs,
  readMemberAreaSessionFromHeaders,
  readParentAreaSessionFromHeaders,
} from "@/lib/publicAreaSession"
import { sendVerificationEmail } from "@/lib/resendClient"
import { supabase } from "@/lib/supabaseClient"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

type CheckinRow = {
  id: string
  member_id: string
  group_name: string
  weight: number | null
  created_at: string
  date: string
  time: string
  year: number
  month_key: string
}

type MemberRecord = {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  birthdate?: string
  email?: string | null
  email_verified?: boolean
  email_verified_at?: string | null
  email_verification_token?: string | null
  phone?: string | null
  guardian_name?: string | null
  has_competition_pass?: boolean | null
  is_competition_member?: boolean | null
  competition_license_number?: string | null
  competition_target_weight?: number | null
  last_medical_exam_date?: string | null
  competition_fights?: number | null
  competition_wins?: number | null
  competition_losses?: number | null
  competition_draws?: number | null
  is_trial?: boolean
  is_approved?: boolean
  base_group?: string | null
}

type ParentChildRow = {
  member_id: string
  members?: MemberRecord | MemberRecord[] | null
}

type SafeParentAccountRow = {
  id: string
  parent_name: string
  email: string
  phone?: string | null
}

type MemberAreaBody =
  | {
      action: "member_login"
      email?: string
      pin?: string
    }
  | {
      action: "member_session"
    }
  | {
      action: "logout_member_session"
    }
  | {
      action: "trainer_linked_member"
    }
  | {
      action: "parent_session"
    }
  | {
      action: "logout_parent_session"
    }
  | {
      action: "parent_login"
      email?: string
      firstName?: string
      lastName?: string
      accessCode?: string
    }
  | {
      action: "verify_email"
      token?: string
    }
  | {
      action: "update_profile"
      memberId?: string
      email?: string
      phone?: string
      newPin?: string
      loginEmail?: string
      pin?: string
    }
  | {
      action: "resend_verification"
      memberId?: string
      email?: string
      loginEmail?: string
      pin?: string
    }

const MEMBER_LOGIN_ERROR_MESSAGE = "Mitglied nicht gefunden oder PIN nicht korrekt."
const MEMBER_MISSING_EMAIL_MESSAGE =
  "Für dieses Konto ist noch keine E-Mail-Adresse hinterlegt. Bitte Trainer oder Admin ansprechen."

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

function getPreviousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(year, month - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function calculateTrainingStreak(checkins: Array<{ date: string }>) {
  if (checkins.length === 0) return 0

  const uniqueDates = Array.from(new Set(checkins.map((c) => c.date))).sort().reverse()
  let streak = 1

  for (let i = 1; i < uniqueDates.length; i++) {
    const current = new Date(`${uniqueDates[i - 1]}T12:00:00`)
    const next = new Date(`${uniqueDates[i]}T12:00:00`)
    const diffDays = Math.round((current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays <= 7) streak += 1
    else break
  }

  return streak
}

function getMemberDisplayName(member?: Partial<MemberRecord> | null) {
  const first = member?.first_name ?? ""
  const last = member?.last_name ?? ""
  const full = `${first} ${last}`.trim()
  return full || member?.name || "—"
}

function generateEmailVerificationToken() {
  return randomUUID()
}

function sanitizeMemberForClient(member: MemberRecord & Record<string, unknown>) {
  const sanitized = { ...member }
  delete sanitized.member_pin
  delete sanitized.email_verification_token
  return sanitized as MemberRecord
}

function toSafeParentAccount(parent: ParentAccountRow): SafeParentAccountRow {
  return {
    id: parent.id,
    parent_name: parent.parent_name,
    email: parent.email,
    phone: parent.phone ?? null,
  }
}

async function buildMemberSnapshot(member: MemberRecord) {
  const normalizedMember = {
    ...sanitizeMemberForClient(member as MemberRecord & Record<string, unknown>),
    base_group: normalizeTrainingGroup(member.base_group) || member.base_group,
  }
  const liveDate = new Date().toISOString().slice(0, 10)
  const currentYear = new Date(`${liveDate}T12:00:00`).getFullYear()
  const currentMonthKey = getMonthKey(liveDate)
  const previousMonthKey = getPreviousMonthKey(currentMonthKey)

  const [
    { data: monthRows },
    { data: previousMonthRows },
    { data: yearRows },
    { data: allRows },
    { data: lastRow },
    { data: recentRows },
    { data: attendanceRows },
  ] = await Promise.all([
    supabase.from("checkins").select("*").eq("member_id", member.id).eq("month_key", currentMonthKey),
    supabase.from("checkins").select("*").eq("member_id", member.id).eq("month_key", previousMonthKey),
    supabase.from("checkins").select("*").eq("member_id", member.id).eq("year", currentYear),
    supabase.from("checkins").select("date").eq("member_id", member.id).order("date", { ascending: false }),
    supabase
      .from("checkins")
      .select("*")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("checkins")
      .select("*")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("checkins")
      .select("*")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false }),
  ])

  let baseGroupMonthVisits = 0
  let baseGroupPosition: number | null = null

  if (normalizedMember.base_group) {
    const { data: baseGroupRows } = await supabase
      .from("checkins")
      .select("member_id")
      .eq("group_name", normalizedMember.base_group)
      .eq("month_key", currentMonthKey)

    baseGroupMonthVisits = (baseGroupRows || []).filter((row) => row.member_id === member.id).length

    const countsMap = new Map<string, number>()
    for (const row of baseGroupRows || []) {
      countsMap.set(row.member_id, (countsMap.get(row.member_id) || 0) + 1)
    }

    const sorted = Array.from(countsMap.entries()).sort((a, b) => b[1] - a[1])
    const myIndex = sorted.findIndex(([id]) => id === member.id)
    baseGroupPosition = myIndex >= 0 ? myIndex + 1 : null
  }

  return {
    member: normalizedMember,
    personalMonthVisits: monthRows?.length ?? 0,
    previousMonthVisits: previousMonthRows?.length ?? 0,
    personalYearVisits: yearRows?.length ?? 0,
    personalLastCheckin: (lastRow as CheckinRow | null) ?? null,
    memberAttendanceRows: (attendanceRows as CheckinRow[] | null) ?? [],
    recentCheckins: (recentRows as CheckinRow[] | null) ?? [],
    trainingStreak: calculateTrainingStreak((allRows as Array<{ date: string }>) ?? []),
    baseGroupMonthVisits,
    baseGroupPosition,
  }
}

async function buildParentSnapshot(parent: ParentAccountRow) {
  const childrenResponse = (await getChildrenForParent(parent.id)) as ParentChildRow[]
  const children = childrenResponse
    .map((row) => (Array.isArray(row.members) ? row.members[0] ?? null : row.members ?? null))
    .filter((member): member is MemberRecord => Boolean(member))
    .map((member) => sanitizeMemberForClient(member as MemberRecord & Record<string, unknown>))
    .sort((a, b) => getMemberDisplayName(a).localeCompare(getMemberDisplayName(b)))

  const childIds = children.map((child) => child.id)
  const checkinsByMember: Record<string, CheckinRow[]> = {}

  if (childIds.length > 0) {
    const { data, error } = await supabase
      .from("checkins")
      .select("*")
      .in("member_id", childIds)
      .order("created_at", { ascending: false })

    if (error) throw error

    for (const row of ((data as CheckinRow[] | null) ?? [])) {
      if (!checkinsByMember[row.member_id]) {
        checkinsByMember[row.member_id] = []
      }
      checkinsByMember[row.member_id].push(row)
    }
  }

  return {
    parent: toSafeParentAccount(parent),
    children,
    checkinsByMember,
    sessionUntil: Date.now() + getPublicAreaSessionMaxAgeMs(),
  }
}

async function resolveTrainerLinkedMember(request: Request) {
  const session = await readTrainerSessionFromHeaders(request)
  if (!session) return null

  if (session.linkedMemberId) {
    return (await findMemberById(session.linkedMemberId)) as MemberRecord | null
  }

  if (session.accountEmail) {
    const byEmail = (await findMemberByEmail(session.accountEmail)) as MemberRecord | null
    if (byEmail) return byEmail
  }

  if (session.accountFirstName && session.accountLastName) {
    return (await findMemberByFirstLastName(session.accountFirstName, session.accountLastName)) as MemberRecord | null
  }

  return null
}

async function resolveEditableMember(request: Request, body: { memberId?: string; loginEmail?: string; pin?: string }) {
  const memberSession = await readMemberAreaSessionFromHeaders(request)
  if (memberSession && body.memberId) {
    const sessionMember = (await findMemberById(memberSession.memberId)) as MemberRecord | null
    if (sessionMember && sessionMember.id === body.memberId) {
      return sessionMember
    }
  }

  const sessionMember = await resolveTrainerLinkedMember(request)
  if (sessionMember && sessionMember.id === body.memberId) {
    return sessionMember
  }

  const loginEmail = body.loginEmail?.trim().toLowerCase() ?? ""
  const pin = body.pin?.trim() ?? ""

  if (!loginEmail || !isValidPin(pin)) {
    return null
  }

  const memberMatch = await findMemberByEmailAndPin(loginEmail, pin)
  if (!memberMatch || memberMatch.status !== "success") {
    return null
  }

  const member = memberMatch.member as MemberRecord
  if (!member || member.id !== body.memberId) return null
  return member
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as MemberAreaBody
    const normalizedIdentifier =
      body.action === "member_login"
        ? body.email?.trim().toLowerCase() ?? ""
        : body.action === "parent_login"
          ? body.email?.trim().toLowerCase() ?? ""
          : body.action === "update_profile" || body.action === "resend_verification"
            ? body.memberId?.trim() || body.loginEmail?.trim().toLowerCase() || body.email?.trim().toLowerCase() || ""
            : body.action
    const rateLimit = await checkRateLimitAsync(
      `public-member-area:${getRequestIp(request)}:${body.action}:${normalizedIdentifier || "__subject__"}`,
      40,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    if (body.action === "member_login") {
      const email = body.email?.trim().toLowerCase() ?? ""
      const pin = body.pin?.trim() ?? ""

      if (!email || !pin) {
        return new NextResponse("Bitte E-Mail und PIN eingeben.", { status: 400 })
      }

      if (!isValidPin(pin)) {
        return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      const memberMatch = await findMemberByEmailAndPin(email, pin)
      if (memberMatch?.status === "missing_email") {
        return new NextResponse(MEMBER_MISSING_EMAIL_MESSAGE, { status: 409 })
      }

      const member = (memberMatch?.status === "success" ? memberMatch.member : null) as MemberRecord | null
      if (!member) {
        return new NextResponse(MEMBER_LOGIN_ERROR_MESSAGE, { status: 404 })
      }

      const response = NextResponse.json(await buildMemberSnapshot(member))
      return await applyMemberAreaSessionCookie(response, {
        memberId: member.id,
        email,
      })
    }

    if (body.action === "member_session") {
      const session = await readMemberAreaSessionFromHeaders(request)
      if (!session) {
        return new NextResponse("Unauthorized", { status: 401 })
      }

      const member = (await findMemberById(session.memberId)) as MemberRecord | null
      if (!member) {
        const response = new NextResponse("Unauthorized", { status: 401 })
        return clearMemberAreaSessionCookie(response)
      }

      return NextResponse.json(await buildMemberSnapshot(member))
    }

    if (body.action === "logout_member_session") {
      const response = NextResponse.json({ ok: true })
      return clearMemberAreaSessionCookie(response)
    }

    if (body.action === "trainer_linked_member") {
      const member = await resolveTrainerLinkedMember(request)
      if (!member) {
        return new NextResponse("Kein verknuepftes Mitglied gefunden.", { status: 404 })
      }

      return NextResponse.json(await buildMemberSnapshot(member))
    }

    if (body.action === "parent_session") {
      const session = await readParentAreaSessionFromHeaders(request)
      if (!session) {
        return new NextResponse("Unauthorized", { status: 401 })
      }

      const parent = await getParentAccountByEmail(session.email)
      if (!parent || parent.id !== session.parentAccountId) {
        const response = new NextResponse("Unauthorized", { status: 401 })
        return clearParentAreaSessionCookie(response)
      }

      return NextResponse.json(await buildParentSnapshot(parent))
    }

    if (body.action === "logout_parent_session") {
      const response = NextResponse.json({ ok: true })
      return clearParentAreaSessionCookie(response)
    }

    if (body.action === "parent_login") {
      const email = body.email?.trim().toLowerCase() ?? ""
      const firstName = body.firstName?.trim() ?? ""
      const lastName = body.lastName?.trim() ?? ""
      const accessCode = body.accessCode?.trim() ?? ""

      if (!email || !accessCode) {
        return new NextResponse("Bitte Eltern-E-Mail und Eltern-Zugangscode eingeben.", { status: 400 })
      }

      const existingParent = await getParentAccountByEmail(email)
      let parent: ParentAccountRow | null = null

      if (existingParent && isParentAccountSetupPending(existingParent)) {
        if (!firstName || !lastName) {
          return new NextResponse("Bitte beim ersten Öffnen Vorname und Nachname des Elternteils angeben.", { status: 400 })
        }

        const { data: activatedParent, error: parentUpdateError } = await supabase
          .from("parent_accounts")
          .update({
            parent_name: `${firstName} ${lastName}`.trim(),
            access_code_hash: await hashParentAccessCode(accessCode),
          })
          .eq("id", existingParent.id)
          .select("*")
          .single()

        if (parentUpdateError) throw parentUpdateError
        parent = activatedParent as ParentAccountRow
      } else {
        parent = await getParentAccountByLogin(email, accessCode)
      }

      if (!parent) {
        return new NextResponse("Kein Elternkonto mit dieser Kombination gefunden.", { status: 404 })
      }

      const response = NextResponse.json(await buildParentSnapshot(parent))
      return await applyParentAreaSessionCookie(response, {
        parentAccountId: parent.id,
        email: parent.email,
      })
    }

    if (body.action === "verify_email") {
      const token = body.token?.trim() ?? ""
      if (!token) {
        return new NextResponse("Bestaetigungslink ungueltig oder bereits verwendet.", { status: 400 })
      }

      const { data, error } = await supabase
        .from("members")
        .update({
          email_verified: true,
          email_verified_at: new Date().toISOString(),
          email_verification_token: null,
        })
        .eq("email_verification_token", token)
        .select("id")
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return new NextResponse("Bestaetigungslink ungueltig oder bereits verwendet.", { status: 404 })
      }

      return NextResponse.json({ ok: true })
    }

    if (body.action === "update_profile") {
      const member = await resolveEditableMember(request, body)
      if (!member) {
        return new NextResponse("Unauthorized", { status: 401 })
      }

      const email = body.email?.trim() ?? ""
      if (!email) {
        return new NextResponse("Bitte eine E-Mail-Adresse angeben.", { status: 400 })
      }

      const newPin = body.newPin?.trim() ?? ""
      if (newPin && !isValidPin(newPin)) {
        return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      const updated = await updateMemberProfile(member.id, {
        email,
        phone: body.phone?.trim() ?? "",
        member_pin: newPin || undefined,
      })

      return NextResponse.json({ ok: true, member: sanitizeMemberForClient(updated as MemberRecord & Record<string, unknown>) })
    }

    if (body.action === "resend_verification") {
      const member = await resolveEditableMember(request, body)
      if (!member) {
        return new NextResponse("Unauthorized", { status: 401 })
      }

      const targetEmail = body.email?.trim() || member.email || ""
      if (!targetEmail) {
        return new NextResponse("Bitte eine E-Mail-Adresse angeben.", { status: 400 })
      }

      const verificationToken = member.email_verification_token || generateEmailVerificationToken()

      if (!member.email_verification_token) {
        const { error } = await supabase
          .from("members")
          .update({ email_verification_token: verificationToken })
          .eq("id", member.id)

        if (error) throw error
      }

      const verificationBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
      const verificationLink = `${verificationBaseUrl}/mein-bereich?verify=${verificationToken}`

      await sendVerificationEmail({
        email: targetEmail,
        name: getMemberDisplayName(member),
        link: verificationLink,
        kind: "member",
      })

      return NextResponse.json({ ok: true })
    }

    return new NextResponse("Invalid action", { status: 400 })
  } catch (error) {
    console.error("public member area failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
