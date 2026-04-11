import { isValidMemberPassword, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/memberPassword"
import { ensureMemberAuthUserLink } from "@/lib/memberAuthLink"
import { getAppBaseUrl, DEFAULT_APP_BASE_URL } from "@/lib/mailConfig"
import { sendVerificationEmail } from "@/lib/resendClient"
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

// Keine Trainer-/Admin-Session-Logik importieren oder verwenden
import {
  findMemberByEmail,
  findMemberByEmailAndPin,
  findMemberByFirstLastName,
  findMemberById,
  updateMemberProfile,
  setMemberPinOnly
} from "@/lib/boxgymDb"
import { sessions } from "@/lib/boxgymSessions"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import {
  applyMemberAreaSessionCookie,
  clearMemberAreaSessionCookie,
  readMemberAreaSessionFromHeaders
} from "@/lib/publicAreaSession"

type MemberAreaBody =
  | { action: "member_login"; email?: string; password?: string; pin?: string }
  | { action: "member_session" }
  | { action: "logout_member_session" }
  | { action: "trainer_linked_member" }
  | { action: "verify_email"; token?: string }
  | { action: "update_profile"; memberId?: string; email?: string; phone?: string; newPassword?: string; newPin?: string; loginEmail?: string; password?: string; pin?: string }
  | { action: "resend_verification"; memberId?: string; email?: string; loginEmail?: string; password?: string; pin?: string }
  | { action: "verify_and_set_password"; token?: string; password?: string }
  | { action: "accept_privacy_consent"; email?: string; password?: string; pin?: string; consent?: boolean }

const MEMBER_LOGIN_ERROR_MESSAGE = "Mitglied nicht gefunden oder Passwort nicht korrekt."

// Minimal benötigte lokale Typen
type MemberRecord = {
  id: string
  first_name?: string
  last_name?: string
  name?: string
  email?: string | null
  email_verified?: boolean
  email_verified_at?: string | null
  privacy_accepted_at?: string | null
  email_verification_token?: string | null
  phone?: string | null
  base_group?: string | null
  member_qr_token?: string | null
  member_qr_active?: boolean | null
}

type CheckinRow = {
  id: string
  member_id: string
  group_name: string
  created_at: string
  date: string
  month_key: string
}

const supabase = createServerSupabaseServiceClient()

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
  const latestScheduledAttendance = attendedDates.find((date) => hasScheduledBaseGroupTraining(normalizedBaseGroup, date))

  if (!latestScheduledAttendance) return 0

  let streak = 1
  let currentDate = latestScheduledAttendance

  while (true) {
    const previousScheduledDate = findPreviousScheduledBaseGroupDate(normalizedBaseGroup, currentDate)
    if (!previousScheduledDate) return streak
    if (!attendedDates.includes(previousScheduledDate)) return streak

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
      return NextResponse.json({ ok: false, code: "forbidden", message: "Forbidden" }, { status: 403 })
    }

    const body = (await request.json()) as MemberAreaBody
    const normalizedIdentifier =
      body.action === "member_login"
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
      return NextResponse.json({ ok: false, code: "rate_limit", message: "Too many requests" }, { status: 429 })
    }

    if (body.action === "member_login") {
      // Nur Member-Session-Logik verwenden
      const email = sanitizeMemberAreaEmail(body.email)
      const password = sanitizeMemberAreaPassword(body.password ?? body.pin)
      const requestIp = getRequestIp(request)
      const rateLimit = await checkRateLimitAsync(`member-login:${requestIp}`, 5, 15 * 60 * 1000)
      if (!rateLimit.ok) {
        return NextResponse.json({ ok: false, code: "rate_limit", message: "Too many requests" }, { status: 429 })
      }

      const loginKey = `member:${email || "__email__"}`
      const lockState = await getLoginLockStateAsync(loginKey, 10)
      if (lockState.blocked) {
        await delayFailedLogin()
        const minutes = Math.max(1, Math.ceil((lockState.retryAfterMs ?? 0) / 60000))
        return NextResponse.json({ ok: false, code: "login_locked", message: `Zu viele Fehlversuche. Bitte ${minutes} Minuten warten.` }, { status: 429 })
      }

      if (!email || !password) {
        return NextResponse.json({ ok: false, code: "missing_credentials", message: "Bitte E-Mail und Passwort eingeben." }, { status: 400 })
      }

      if (!isWithinMaxLength(email, 254) || !isWithinMaxLength(password, 64)) {
        return NextResponse.json({ ok: false, code: "invalid_credentials", message: "Ungültige Anmeldedaten." }, { status: 400 })
      }

      const memberMatch = await findMemberByEmailAndPin(email, password)
      if (memberMatch?.status === "missing_email") {
        await registerLoginFailureAsync(loginKey, 10, 15 * 60 * 1000, 15 * 60 * 1000)
        await delayFailedLogin()
        return NextResponse.json({ ok: false, code: "not_found", message: MEMBER_LOGIN_ERROR_MESSAGE }, { status: 401 })
      }

      const member = (memberMatch?.status === "success" ? memberMatch.member : null) as MemberRecord | null
      if (!member) {
        await registerLoginFailureAsync(loginKey, 10, 15 * 60 * 1000, 15 * 60 * 1000)
        await delayFailedLogin()
        return NextResponse.json({ ok: false, code: "not_found", message: MEMBER_LOGIN_ERROR_MESSAGE }, { status: 401 })
      }

      await clearLoginFailuresAsync(loginKey)

      if (!hasAcceptedPrivacy(member)) {
        return NextResponse.json({ ok: false, code: "privacy_consent_required", message: "Bitte Datenschutz akzeptieren." }, { status: 403 })
      }

      const memberData = await buildMemberSnapshot(member)
      return await applyMemberAreaSessionCookie(
        NextResponse.json({ ok: true, code: "login_success", message: "Login erfolgreich.", member: memberData }),
        { memberId: member.id, email }
      )
    }

    if (body.action === "member_session") {
      // Nur Member-Session-Logik verwenden
      const session = await readMemberAreaSessionFromHeaders(request)
      if (!session) {
        return NextResponse.json({ ok: false, code: "not_logged_in", message: "Nicht eingeloggt." }, { status: 401 })
      }

      const member = (await findMemberById(session.memberId)) as MemberRecord | null
      if (!member) {
        return clearMemberAreaSessionCookie(
          NextResponse.json({ ok: false, code: "not_found", message: "Mitglied nicht gefunden." }, { status: 401 })
        )
      }

      if (!hasAcceptedPrivacy(member)) {
        return clearMemberAreaSessionCookie(
          NextResponse.json({ ok: false, code: "privacy_consent_required", message: "Bitte Datenschutz akzeptieren." }, { status: 403 })
        )
      }

      const memberData = await buildMemberSnapshot(member)
      return NextResponse.json({ ok: true, code: "session_valid", message: "Session gültig.", member: memberData })
    }

    if (body.action === "logout_member_session") {
      // Nur Member-Session-Logik verwenden
      return clearMemberAreaSessionCookie(
        NextResponse.json({ ok: true, code: "logout_success", message: "Logout erfolgreich." })
      )
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


    if (body.action === "verify_email") {
      const token = sanitizeToken(body.token);
      console.log("VERIFY_START", { token });
      if (!token) {
        console.warn("VERIFY_TOKEN_MISSING");
        return new NextResponse("Bestätigungslink ungültig oder bereits verwendet.", { status: 400 });
      }

      let member = null;
      try {
        const { data, error } = await supabase
          .from("members")
          .update({
            email_verified: true,
            email_verified_at: new Date().toISOString(),
            email_verification_token: null,
          })
          .eq("email_verification_token", token)
          .select("id, email_verified")
          .maybeSingle();

        if (error) {
          console.error("VERIFY_FAILED", { error });
          return new NextResponse("Technischer Fehler bei der Bestätigung.", { status: 500 });
        }
        if (!data) {
          console.warn("VERIFY_TOKEN_NOT_FOUND", { token });
          return new NextResponse("Bestätigungslink ungültig oder bereits verwendet.", { status: 404 });
        }
        member = data;
      } catch (updateError) {
        console.error("VERIFY_FAILED", { error: updateError });
        return new NextResponse("Technischer Fehler bei der Bestätigung.", { status: 500 });
      }

      if (member && member.id) {
        console.log("VERIFY_TOKEN_FOUND", { id: member.id });
        if (member.email_verified) {
          console.log("VERIFY_ALREADY_VERIFIED", { id: member.id });
        } else {
          console.log("VERIFY_UPDATED", { id: member.id });
        }
      }
      return NextResponse.json({ ok: true });
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
      const verificationLink = `${verificationBaseUrl}/mein-bereich?verify=${encodeURIComponent(verificationToken)}`

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
