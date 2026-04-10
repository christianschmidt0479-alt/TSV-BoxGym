import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import {
  checkRateLimitAsync,
  clearLoginFailuresAsync,
  delayFailedLogin,
  getLoginLockStateAsync,
  getRequestIp,
  isAllowedOrigin,
  isWithinMaxLength,
  registerLoginFailureAsync,
  sanitizeTextInput,
} from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import {
  findMemberByEmail,
  findMemberByEmailAndPin,
  findMemberByFirstLastName,
  findMemberById,
  updateMemberProfile,
  setMemberPinOnly,
} from "@/lib/boxgymDb"
import { ensureMemberAuthUserLink } from "@/lib/memberAuthLink"
import { isValidMemberPassword, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/memberPassword"
import {
  getChildrenForParent,
  getParentAccountByEmail,
  getParentAccountByLogin,
  isParentAccountSetupPending,
  type ParentAccountRow,
} from "@/lib/parentAccountsDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { sessions } from "@/lib/boxgymSessions"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
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
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

const supabase = createServerSupabaseServiceClient()

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
  privacy_accepted_at?: string | null
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
  office_list_status?: string | null
  office_list_group?: string | null
  office_list_checked_at?: string | null
  member_qr_token?: string | null
  member_qr_active?: boolean | null
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
      password?: string
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
      newPassword?: string
      newPin?: string
      loginEmail?: string
      password?: string
      pin?: string
    }
  | {
      action: "resend_verification"
      memberId?: string
      email?: string
      loginEmail?: string
      password?: string
      pin?: string
    }
  | {
      action: "verify_and_set_password"
      token?: string
      password?: string
    }
  | {
      action: "accept_privacy_consent"
      email?: string
      password?: string
      pin?: string
      consent?: boolean
    }

const MEMBER_LOGIN_ERROR_MESSAGE = "Mitglied nicht gefunden oder Passwort nicht korrekt."
const PARENT_LOGIN_ERROR_MESSAGE = "Elternkonto nicht gefunden oder Passwort nicht korrekt."

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

function getPreviousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(year, month - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function hasScheduledBaseGroupTraining(baseGroup: string, dateString: string) {
  const date = new Date(`${dateString}T12:00:00`)
  const day = date.getDay()

  return sessions.some((session) => {
    const normalizedGroup = normalizeTrainingGroup(session.group) || session.group
    if (normalizedGroup !== baseGroup) return false

    if (session.dayKey === "Montag") return day === 1
    if (session.dayKey === "Dienstag") return day === 2
    if (session.dayKey === "Mittwoch") return day === 3
    if (session.dayKey === "Donnerstag") return day === 4
    if (session.dayKey === "Freitag") return day === 5
    return false
  })
}

function findPreviousScheduledBaseGroupDate(baseGroup: string, beforeDate: string) {
  let cursor = addDays(beforeDate, -1)

  for (let index = 0; index < 14; index += 1) {
    if (hasScheduledBaseGroupTraining(baseGroup, cursor)) {
      return cursor
    }
    cursor = addDays(cursor, -1)
  }

  return null
}

function calculateScheduledBaseGroupTrainingStreak({
  checkins,
  baseGroup,
  endDate,
}: {
  checkins: Array<{ date: string; group_name?: string | null }>
  baseGroup?: string | null
  endDate: string
}) {
  const normalizedBaseGroup = normalizeTrainingGroup(baseGroup)
  if (!normalizedBaseGroup) return 0

  const attendedDates = Array.from(
    new Set(
      checkins
        .filter((row) => (normalizeTrainingGroup(row.group_name) || row.group_name) === normalizedBaseGroup)
        .map((row) => row.date)
        .filter((date) => date <= endDate)
    )
  ).sort().reverse()

  if (attendedDates.length === 0) return 0

  const attendedDateSet = new Set(attendedDates)
  const latestScheduledAttendance = attendedDates.find((date) => hasScheduledBaseGroupTraining(normalizedBaseGroup, date))

  if (!latestScheduledAttendance) return 0

  let streak = 1
  let currentDate = latestScheduledAttendance

  while (true) {
    const previousScheduledDate = findPreviousScheduledBaseGroupDate(normalizedBaseGroup, currentDate)
    if (!previousScheduledDate) return streak
    if (!attendedDateSet.has(previousScheduledDate)) return streak

    streak += 1
    currentDate = previousScheduledDate
  }
}

function calculateTrainingStreak({
  checkins,
  baseGroup,
  liveDate,
  disableCheckinTimeWindow,
}: {
  checkins: Array<{ date: string; group_name?: string | null }>
  baseGroup?: string | null
  liveDate: string
  disableCheckinTimeWindow: boolean
}) {
  const normalizedBaseGroup = normalizeTrainingGroup(baseGroup)
  if (!normalizedBaseGroup) return 0

  const scheduledStreak = calculateScheduledBaseGroupTrainingStreak({
    checkins,
    baseGroup: normalizedBaseGroup,
    endDate: disableCheckinTimeWindow ? addDays(liveDate, -1) : liveDate,
  })

  if (!disableCheckinTimeWindow || normalizedBaseGroup === "L-Gruppe") {
    return scheduledStreak
  }

  const attendedTodayInBaseGroup = checkins.some(
    (row) => row.date === liveDate && (normalizeTrainingGroup(row.group_name) || row.group_name) === normalizedBaseGroup
  )

  return attendedTodayInBaseGroup ? scheduledStreak + 1 : scheduledStreak
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

function hasAcceptedPrivacy(member: MemberRecord | null | undefined) {
  if (!member) return false
  if (!("privacy_accepted_at" in member)) return true
  return Boolean(member.privacy_accepted_at)
}

function privacyConsentRequiredResponse() {
  return NextResponse.json(
    {
      code: "privacy_consent_required",
      message: "Bitte Datenschutz akzeptieren",
    },
    { status: 409 }
  )
}

function sanitizeMemberAreaEmail(value: unknown) {
  return sanitizeTextInput(value, { lowercase: true, maxLength: 254 })
}

function sanitizeMemberAreaPassword(value: unknown) {
  return sanitizeTextInput(value, { maxLength: 64 })
}

function sanitizeParentAccessCode(value: unknown) {
  return sanitizeTextInput(value, { maxLength: 64 })
}

function sanitizeMemberId(value: unknown) {
  return sanitizeTextInput(value, { maxLength: 64 })
}

function sanitizePhone(value: unknown) {
  return sanitizeTextInput(value, { maxLength: 40 })
}

function sanitizeToken(value: unknown) {
  return sanitizeTextInput(value, { maxLength: 200 })
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
    checkinSettings,
    { data: monthRows },
    { data: previousMonthRows },
    { data: yearRows },
    { data: allRows },
    { data: lastRow },
    { data: recentRows },
    { data: attendanceRows },
  ] = await Promise.all([
    readCheckinSettings(),
    supabase.from("checkins").select("*").eq("member_id", member.id).eq("month_key", currentMonthKey),
    supabase.from("checkins").select("*").eq("member_id", member.id).eq("month_key", previousMonthKey),
    supabase.from("checkins").select("*").eq("member_id", member.id).eq("year", currentYear),
    supabase.from("checkins").select("date, group_name").eq("member_id", member.id).order("date", { ascending: false }),
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

  // Regelbasierte Trainingshinweise (keine neuen DB-Queries)
  const str7dAgo = addDays(liveDate, -7)
  const str14dAgo = addDays(liveDate, -14)
  const str28dAgo = addDays(liveDate, -28)
  const str30dAgo = addDays(liveDate, -30)

  const checkinDateRows = (allRows as Array<{ date: string }> | null) ?? []
  const weeklyCheckinCount = checkinDateRows.filter((r) => r.date >= str7dAgo).length
  const monthlyCheckinCount = checkinDateRows.filter((r) => r.date >= str30dAgo).length
  const last14dCount = checkinDateRows.filter((r) => r.date >= str14dAgo).length
  const prior14dCount = checkinDateRows.filter((r) => r.date >= str28dAgo && r.date < str14dAgo).length

  const trainingStatus: "regelmäßig" | "unregelmäßig" | "pausiert" =
    last14dCount >= 4 ? "regelmäßig" : last14dCount >= 1 ? "unregelmäßig" : "pausiert"

  const lastCheckinDate = (lastRow as CheckinRow | null)?.date ?? null
  const inactiveLevel: "none" | "7d" | "14d" | "30d" = !lastCheckinDate
    ? "30d"
    : lastCheckinDate < str30dAgo
    ? "30d"
    : lastCheckinDate < str14dAgo
    ? "14d"
    : lastCheckinDate < str7dAgo
    ? "7d"
    : "none"

  const activityTrend: "steigend" | "stabil" | "rückläufig" | "unbekannt" =
    last14dCount === 0 && prior14dCount === 0
      ? "unbekannt"
      : last14dCount > prior14dCount
      ? "steigend"
      : last14dCount === prior14dCount
      ? "stabil"
      : "rückläufig"

  let memberHint: string
  if (last14dCount >= 4) {
    memberHint = `In den letzten 14 Tagen ${last14dCount}× eingecheckt – regelmäßig aktiv.`
  } else if (inactiveLevel === "30d") {
    memberHint = "Seit mehr als 30 Tagen kein Check-in erfasst."
  } else if (inactiveLevel === "14d") {
    memberHint = "Seit 14 Tagen kein Check-in erfasst."
  } else if (inactiveLevel === "7d") {
    memberHint = "In den letzten 7 Tagen kein Check-in erfasst."
  } else if (activityTrend === "steigend") {
    memberHint = "Aktivität aktuell steigend."
  } else if (activityTrend === "rückläufig") {
    memberHint = "Aktivität aktuell rückläufig."
  } else if (last14dCount > 0) {
    memberHint = `In den letzten 14 Tagen ${last14dCount} Check-in${last14dCount !== 1 ? "s" : ""} erfasst.`
  } else {
    memberHint = "Noch kein Check-in erfasst."
  }

  const lastCheckinAt = (lastRow as CheckinRow | null)?.created_at ?? null

  return {
    member: normalizedMember,
    personalMonthVisits: monthRows?.length ?? 0,
    previousMonthVisits: previousMonthRows?.length ?? 0,
    personalYearVisits: yearRows?.length ?? 0,
    personalLastCheckin: (lastRow as CheckinRow | null) ?? null,
    memberAttendanceRows: (attendanceRows as CheckinRow[] | null) ?? [],
    recentCheckins: (recentRows as CheckinRow[] | null) ?? [],
    trainingStreak: calculateTrainingStreak({
      checkins: (allRows as Array<{ date: string; group_name?: string | null }>) ?? [],
      baseGroup: normalizedMember.base_group,
      liveDate,
      disableCheckinTimeWindow: checkinSettings.disableCheckinTimeWindow,
    }),
    baseGroupMonthVisits,
    baseGroupPosition,
    trainingStatus,
    lastCheckinAt,
    activityTrend,
    inactiveLevel,
    memberHint,
    monthlyCheckinCount,
    weeklyCheckinCount,
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

async function resolveEditableMember(request: Request, body: { memberId?: string; loginEmail?: string; password?: string; pin?: string }) {
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

  const loginEmail = sanitizeMemberAreaEmail(body.loginEmail)
  const password = sanitizeMemberAreaPassword(body.password ?? body.pin)

  if (!loginEmail || !password) {
    return null
  }

  const memberMatch = await findMemberByEmailAndPin(loginEmail, password)
  if (!memberMatch || memberMatch.status !== "success") {
    return null
  }

  const member = memberMatch.member as MemberRecord
  if (!member || member.id !== body.memberId) return null
  return member
}

async function resolveMemberFromSessionOrCredentials(
  request: Request,
  body: { email?: string; password?: string; pin?: string }
) {
  const memberSession = await readMemberAreaSessionFromHeaders(request)
  if (memberSession) {
    const sessionMember = (await findMemberById(memberSession.memberId)) as MemberRecord | null
    if (sessionMember) return sessionMember
  }

  const email = sanitizeMemberAreaEmail(body.email)
  const password = sanitizeMemberAreaPassword(body.password ?? body.pin)

  if (!email || !password) {
    return null
  }

  const memberMatch = await findMemberByEmailAndPin(email, password)
  if (!memberMatch || memberMatch.status !== "success") {
    return null
  }

  return memberMatch.member as MemberRecord
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as MemberAreaBody
    const normalizedIdentifier =
      body.action === "member_login"
        ? sanitizeMemberAreaEmail(body.email)
        : body.action === "parent_login"
          ? sanitizeMemberAreaEmail(body.email)
          : body.action === "update_profile" || body.action === "resend_verification"
            ? sanitizeMemberId(body.memberId) || sanitizeMemberAreaEmail(body.loginEmail) || sanitizeMemberAreaEmail(body.email) || ""
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
      const email = sanitizeMemberAreaEmail(body.email)
      const password = sanitizeMemberAreaPassword(body.password ?? body.pin)
      const requestIp = getRequestIp(request)
      const rateLimit = await checkRateLimitAsync(`member-login:${requestIp}`, 5, 15 * 60 * 1000)
      if (!rateLimit.ok) {
        return new NextResponse("Too many requests", { status: 429 })
      }

      const loginKey = `member:${email || "__email__"}`
      const lockState = await getLoginLockStateAsync(loginKey, 10)
      if (lockState.blocked) {
        await delayFailedLogin()
        const minutes = Math.max(1, Math.ceil((lockState.retryAfterMs ?? 0) / 60000))
        return new NextResponse(`Zu viele Fehlversuche. Bitte ${minutes} Minuten warten.`, { status: 429 })
      }

      if (!email || !password) {
        return new NextResponse("Bitte E-Mail und Passwort eingeben.", { status: 400 })
      }

      if (!isWithinMaxLength(email, 254) || !isWithinMaxLength(password, 64)) {
        return new NextResponse("Ungültige Anmeldedaten.", { status: 400 })
      }

      const memberMatch = await findMemberByEmailAndPin(email, password)
      if (memberMatch?.status === "missing_email") {
        await registerLoginFailureAsync(loginKey, 10, 15 * 60 * 1000, 15 * 60 * 1000)
        await delayFailedLogin()
        return new NextResponse(MEMBER_LOGIN_ERROR_MESSAGE, { status: 401 })
      }

      const member = (memberMatch?.status === "success" ? memberMatch.member : null) as MemberRecord | null
      if (!member) {
        await registerLoginFailureAsync(loginKey, 10, 15 * 60 * 1000, 15 * 60 * 1000)
        await delayFailedLogin()
        return new NextResponse(MEMBER_LOGIN_ERROR_MESSAGE, { status: 401 })
      }

      // Minimalfix A: Blockiere Login, wenn nicht verifiziert
      if (!member.email_verified) {
        return new NextResponse("E-Mail noch nicht bestätigt. Bitte zuerst den Bestätigungslink aus der E-Mail öffnen.", { status: 403 })
      }

      await clearLoginFailuresAsync(loginKey)

      if (!hasAcceptedPrivacy(member)) {
        return privacyConsentRequiredResponse()
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

      if (!hasAcceptedPrivacy(member)) {
        const response = privacyConsentRequiredResponse()
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

      if (!hasAcceptedPrivacy(member)) {
        return privacyConsentRequiredResponse()
      }

      const response = NextResponse.json(await buildMemberSnapshot(member))
      return await applyMemberAreaSessionCookie(response, {
        memberId: member.id,
        email: member.email ?? "",
      })
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
      const email = sanitizeMemberAreaEmail(body.email)
      const accessCode = sanitizeParentAccessCode(body.accessCode)

      if (!email || !accessCode) {
        return new NextResponse("Bitte Eltern-E-Mail und Eltern-Passwort eingeben.", { status: 400 })
      }

      if (!isWithinMaxLength(email, 254) || !isWithinMaxLength(accessCode, 64)) {
        return new NextResponse("Ungültige Zugangsdaten.", { status: 400 })
      }

      const existingParent = await getParentAccountByEmail(email)
      if (existingParent && isParentAccountSetupPending(existingParent)) {
        return new NextResponse(PARENT_LOGIN_ERROR_MESSAGE, { status: 401 })
      }

      const parent = await getParentAccountByLogin(email, accessCode)

      if (!parent) {
        return new NextResponse(PARENT_LOGIN_ERROR_MESSAGE, { status: 401 })
      }

      const response = NextResponse.json(await buildParentSnapshot(parent))
      return await applyParentAreaSessionCookie(response, {
        parentAccountId: parent.id,
        email: parent.email,
      })
    }

    if (body.action === "verify_email") {
      const token = sanitizeToken(body.token)
      if (!token) {
        return new NextResponse("Bestätigungslink ungültig, abgelaufen oder bereits verwendet.\n\nHinweis: Nach erneuter Registrierung ist nur der neueste Link gültig.", { status: 400 })
      }

      // Ziel-Datensatz eindeutig per Token finden
      const { data: member, error } = await supabase
        .from("members")
        .select("id, email")
        .eq("email_verification_token", token)
        .maybeSingle()

      if (error) throw error
      if (!member) {
        return new NextResponse("Bestätigungslink ungültig, abgelaufen oder bereits verwendet.\n\nHinweis: Nach erneuter Registrierung ist nur der neueste Link gültig.", { status: 404 })
      }

      // Verifizierung auf Ziel-Datensatz
      await supabase
        .from("members")
        .update({
          email_verified: true,
          email_verified_at: new Date().toISOString(),
          email_verification_token: null,
        })
        .eq("id", member.id)

      // Konkurrierende Tokens für dieselbe E-Mail neutralisieren
      await supabase
        .from("members")
        .update({ email_verification_token: null, email_verification_expires_at: null })
        .eq("email", member.email)
        .neq("id", member.id)

      return NextResponse.json({ ok: true })
    }

    if (body.action === "verify_and_set_password") {
      const token = sanitizeToken(body.token)
      if (!token) {
        return new NextResponse("Bestätigungslink ungültig.", { status: 400 })
      }

      const password = sanitizeMemberAreaPassword(body.password)
      if (!password) {
        return new NextResponse("Bitte ein Passwort eingeben.", { status: 400 })
      }
      if (!isValidMemberPassword(password)) {
        return new NextResponse(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      const { data, error } = await supabase
        .from("members")
        .update({
          email_verified: true,
          email_verified_at: new Date().toISOString(),
          email_verification_token: null,
        })
        .eq("email_verification_token", token)
        .select("id, email")
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return new NextResponse("Bestätigungslink ungültig oder bereits verwendet.", { status: 404 })
      }

      await setMemberPinOnly(data.id, password)

      await ensureMemberAuthUserLink({
        memberId: data.id,
        email: typeof data.email === "string" ? data.email : null,
        password,
        emailVerified: true,
      })

      return NextResponse.json({ ok: true })
    }

    if (body.action === "update_profile") {
      const member = await resolveEditableMember(request, body)
      if (!member) {
        return new NextResponse("Unauthorized", { status: 401 })
      }

      const email = sanitizeTextInput(body.email, { maxLength: 254 })
      if (!email) {
        return new NextResponse("Bitte eine E-Mail-Adresse angeben.", { status: 400 })
      }

      if (!isWithinMaxLength(email, 254)) {
        return new NextResponse("E-Mail-Adresse ist zu lang.", { status: 400 })
      }

      const newPassword = sanitizeMemberAreaPassword(body.newPassword ?? body.newPin)
      if (newPassword && !isValidMemberPassword(newPassword)) {
        return new NextResponse(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      const updated = await updateMemberProfile(member.id, {
        email,
        phone: sanitizePhone(body.phone),
        member_pin: newPassword || undefined,
      })

      if (newPassword || (updated.email ?? "") !== (member.email ?? "")) {
        await ensureMemberAuthUserLink({
          memberId: member.id,
          email: typeof updated.email === "string" ? updated.email : null,
          password: newPassword || null,
          emailVerified: Boolean(updated.email_verified),
        })
      }

      return NextResponse.json({ ok: true, member: sanitizeMemberForClient(updated as MemberRecord & Record<string, unknown>) })
    }

    if (body.action === "resend_verification") {
      const member = await resolveEditableMember(request, body)
      if (!member) {
        return new NextResponse("Unauthorized", { status: 401 })
      }

      const targetEmail = sanitizeTextInput(body.email, { maxLength: 254 }) || member.email || ""
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

      const delivery = await sendVerificationEmail({
        email: targetEmail,
        name: getMemberDisplayName(member),
        link: verificationLink,
        kind: "member",
      })

      return NextResponse.json({
        ok: true,
        verificationLink,
        delivery,
      })
    }

    if (body.action === "accept_privacy_consent") {
      const requestIp = getRequestIp(request)
      const rateLimit = await checkRateLimitAsync(`member-login:${requestIp}`, 5, 15 * 60 * 1000)
      if (!rateLimit.ok) {
        return new NextResponse("Too many requests", { status: 429 })
      }

      if (body.consent !== true) {
        return new NextResponse("Bitte Datenschutz akzeptieren", { status: 400 })
      }

      const loginKey = `member:${sanitizeMemberAreaEmail(body.email) || "__email__"}`
      const lockState = await getLoginLockStateAsync(loginKey, 10)
      if (lockState.blocked) {
        await delayFailedLogin()
        const minutes = Math.max(1, Math.ceil((lockState.retryAfterMs ?? 0) / 60000))
        return new NextResponse(`Zu viele Fehlversuche. Bitte ${minutes} Minuten warten.`, { status: 429 })
      }

      const member = await resolveMemberFromSessionOrCredentials(request, body)
      if (!member) {
        await registerLoginFailureAsync(loginKey, 10, 15 * 60 * 1000, 15 * 60 * 1000)
        await delayFailedLogin()
        return new NextResponse(MEMBER_LOGIN_ERROR_MESSAGE, { status: 401 })
      }

      await clearLoginFailuresAsync(loginKey)

      const { data, error } = await supabase
        .from("members")
        .update({ privacy_accepted_at: new Date().toISOString() })
        .eq("id", member.id)
        .select("*")
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return new NextResponse("Mitglied nicht gefunden oder Passwort nicht korrekt.", { status: 401 })
      }

      const acceptedMember = data as MemberRecord
      const response = NextResponse.json(await buildMemberSnapshot(acceptedMember))
      return await applyMemberAreaSessionCookie(response, {
        memberId: acceptedMember.id,
        email: sanitizeMemberAreaEmail(acceptedMember.email || body.email || ""),
      })
    }

    return new NextResponse("Invalid action", { status: 400 })
  } catch (error) {
    console.error("public member area failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
