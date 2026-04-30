// Hilfsfunktion zum Maskieren von E-Mails (c***@e***.de)
function maskEmail(email: string | undefined | null): string {
  if (!email) return ''
  const [user, domain] = email.split("@")
  if (!user || !domain) return "***"
  const userMasked = user.length > 1 ? user[0] + "***" : "*"
  const domainParts = domain.split(".")
  const domainMasked = domainParts[0].length > 1 ? domainParts[0][0] + "***" : "*"
  const tld = domainParts.slice(1).join(".")
  return `${userMasked}@${domainMasked}${tld ? "." + tld : ""}`
}
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createCheckin, findMemberByEmailAndPin } from "@/lib/boxgymDb"
import { verifyTrainerSessionToken } from "@/lib/authSession"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { handleCheckin } from "@/lib/checkinCore"
import { applyMemberDeviceCookie, clearMemberDeviceCookie, createMemberDeviceToken, getMemberDeviceSessionMaxAgeMs } from "@/lib/memberDeviceSession"
import { getAvailableSessionsForToday, getMemberCheckinMode, getSessionsForDate, resolveMemberCheckinAssignment, checkMemberEligibility } from "@/lib/memberCheckin"
import { isWeightRequiredGroup } from "@/lib/memberUtils"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

const supabase = createServerSupabaseServiceClient()

type MemberCheckinBody = {
  email?: string
  password?: string
  pin?: string
  qrAccessToken?: string
  weight?: string
  sessionId?: string
  selectedGroup?: string
  rememberDevice?: boolean
  // Trainer path
  memberId?: string
  source?: string
}

type MemberRecord = {
  id: string
  first_name?: string | null
  last_name?: string | null
  base_group?: string | null
  email_verified?: boolean | null
  is_trial?: boolean | null
  is_approved?: boolean | null
  is_competition_member?: boolean | null
  member_phase?: string | null
}

function getBerlinDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: parts.year ?? "",
    month: parts.month ?? "",
    day: parts.day ?? "",
    hour: parts.hour ?? "00",
    minute: parts.minute ?? "00",
  }
}

function todayString(date = new Date()) {
  const { year, month, day } = getBerlinDateParts(date)
  return `${year}-${month}-${day}`
}

function timeString(date = new Date()) {
  return date.toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

function parseWeightInput(value: string) {
  const normalized = value.replace(",", ".").trim()
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

export async function POST(request: Request) {
  try {
    const isDev = process.env.NODE_ENV !== "production"
    const logResponseStatus = (statusCode: number) => {
      if (isDev) {
        console.log("CHECKIN RESPONSE STATUS", statusCode)
      }
    }
    const textResponse = (body: string, statusCode: number) => {
      logResponseStatus(statusCode)
      return new NextResponse(body, { status: statusCode })
    }
    const jsonResponse = (body: unknown, statusCode: number) => {
      logResponseStatus(statusCode)
      return NextResponse.json(body, { status: statusCode })
    }

    if (!isAllowedOrigin(request)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn('[member-flow][checkin][error] reason=forbidden')
      }
      return textResponse("Forbidden", 403)
    }

    // SECURITY: Explicitly require POST method
    if (request.method !== "POST") {
      return new NextResponse("Method not allowed", { status: 405 })
    }

    const body = (await request.json()) as MemberCheckinBody
    const email = body.email?.trim().toLowerCase() ?? ""
    const password = body.password?.trim() ?? body.pin?.trim() ?? ""
    if (isDev) {
      console.log("CHECKIN INPUT", {
        email,
        hasPin: Boolean(password),
      })
    }

    const checkinSettings = await readCheckinSettings()
    const checkinMode = getMemberCheckinMode(checkinSettings.disableCheckinTimeWindow)
    const disableNormalWindowForTest =
      !checkinSettings.disableCheckinTimeWindow && checkinSettings.disableNormalCheckinTimeWindow

    const rateLimit = await checkRateLimitAsync(
      `public-member-checkin:${getRequestIp(request)}:${email || body.memberId || "__fallback__"}`,
      25,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return textResponse("Too many requests", 429)
    }

    const now = new Date()
    const liveDate = todayString(now)
    const currentYear = new Date(`${liveDate}T12:00:00`).getFullYear()
    const currentMonthKey = getMonthKey(liveDate)
    const todaysSessions = getSessionsForDate(liveDate)
    const availableGroups = getAvailableSessionsForToday(liveDate)
    const availableGroupNames = availableGroups.map((session) => session.group)
    // ========================================================================
    // MEMBER RESOLUTION — trainer path (memberId + session) or member path (email+pin)
    // ========================================================================
    // SECURITY: source="trainer" is a privileged path. Any request claiming
    // source="trainer" MUST go through trainer-session validation only.
    // It must NEVER fall back to the email+pin path.
    // ========================================================================
    let resolvedMember: MemberRecord | null = null

    if (body.source === "trainer") {
      // SECURITY: memberId is mandatory for trainer path — no fallback allowed
      const trainerMemberId = body.memberId?.trim() ?? ""
      if (!trainerMemberId) {
        return textResponse("memberId erforderlich", 400)
      }
      // SECURITY: valid trainer session required — hard fail if missing or invalid
      const cookieStore = await cookies()
      const session = cookieStore.get("trainer_session")
      if (!session) {
        return textResponse("Nicht autorisiert", 401)
      }
      const trainer = await verifyTrainerSessionToken(session.value)
      if (!trainer) {
        if (process.env.NODE_ENV !== "production") {
          console.warn('[checkin][trainer][invalid_session]')
        }
        return textResponse("Session ungültig", 401)
      }
      if (process.env.NODE_ENV !== "production") {
        console.info('[checkin][trainer][session_ok]')
      }
      // Mitglied per ID laden
      const { data: trainerMember, error: trainerMemberError } = await supabase
        .from("members")
        .select("id, first_name, last_name, base_group, email_verified, is_approved, is_trial, is_competition_member, member_phase")
        .eq("id", trainerMemberId)
        .maybeSingle()
      if (trainerMemberError) throw trainerMemberError
      if (!trainerMember) {
        return textResponse("Mitglied nicht gefunden.", 404)
      }
      resolvedMember = trainerMember as MemberRecord
    } else {
      // Standard Member-Pfad (email + pin) — never reached when source="trainer"
      if (!email || !password) {
        if (process.env.NODE_ENV !== "production") {
          console.warn('[member-flow][checkin][error] reason=missing_credentials email=' + maskEmail(email))
        }
        return textResponse("Bitte E-Mail und Passwort eingeben.", 400)
      }

      const memberMatch = await findMemberByEmailAndPin(email, password)
      if (memberMatch?.status === "missing_email") {
        if (process.env.NODE_ENV !== "production") {
          console.warn('[member-flow][checkin][error] reason=not_found email=' + maskEmail(email))
        }
        return textResponse("Mitglied nicht gefunden oder Passwort nicht korrekt.", 401)
      }
      resolvedMember = (memberMatch?.status === "success" ? memberMatch.member : null) as MemberRecord | null

      if (!resolvedMember) {
        if (process.env.NODE_ENV !== "production") {
          console.warn('[member-flow][checkin][error] reason=not_found email=' + maskEmail(email))
        }
        return textResponse("Mitglied nicht gefunden oder Passwort nicht korrekt.", 401)
      }
    }


    const checkinAssignment = resolveMemberCheckinAssignment({
      dailySessions: todaysSessions,
      now,
      baseGroup: resolvedMember.base_group,
      mode: checkinMode,
      selectedGroup: body.selectedGroup,
      availableGroups: availableGroupNames,
      allowOutsideWindowGroupFallback: disableNormalWindowForTest,
    })
    const bypassTimeWindow = Boolean(checkinSettings.disableCheckinTimeWindow || disableNormalWindowForTest)
    const effectiveGroupName = checkinAssignment.groupName
    const isNoOwnSessionToday = checkinAssignment.reason === "no_own_session_today"
    const isOutsideTimeWindow = checkinAssignment.reason === "outside_time_window"
    const checkinWindowAllowed = Boolean(checkinAssignment.allowed && effectiveGroupName)
    if (isDev) {
      console.log("CHECKIN ASSIGNMENT", {
        groupName: effectiveGroupName,
        session: checkinAssignment?.session,
      })
      console.log("CHECKIN SETTINGS", {
        disableCheckinTimeWindow: checkinSettings?.disableCheckinTimeWindow,
        disableNormalCheckinTimeWindow: checkinSettings?.disableNormalCheckinTimeWindow,
        disableNormalWindowForTest,
      })
      console.log("GROUP CHECK", {
        groupName: effectiveGroupName,
        ferienmodus: checkinSettings.disableCheckinTimeWindow,
      })
    }

    if (isNoOwnSessionToday && !effectiveGroupName) {
      return jsonResponse(
        {
          ok: false,
          reason: "no_own_session_today",
          availableGroups,
        },
        400
      )
    }

    if (isOutsideTimeWindow && !bypassTimeWindow) {
      return jsonResponse(
        {
          ok: false,
          reason: "outside_time_window",
        },
        400
      )
    }

    // Eligibility-Prüfung (zentral)
    const eligibility = checkMemberEligibility({
      member: resolvedMember,
      groupAllowed: Boolean(effectiveGroupName),
      timeAllowed: bypassTimeWindow || checkinWindowAllowed,
    })

    if (!eligibility.eligible) {
      if (process.env.NODE_ENV !== "production") {
        console.warn('[member-flow][checkin][error] reason=' + eligibility.reason + ' id=' + resolvedMember.id)
      }
      // Minimalfix C: Fehlertext für fehlende Verifizierung explizit
      if (eligibility.reason === "email_not_verified") {
        return textResponse("E-Mail noch nicht bestätigt. Bitte zuerst den Bestätigungslink aus der E-Mail öffnen.", 400)
      }
      return jsonResponse({
        ok: false,
        reason: eligibility.reason,
      }, 400)
    }


    const requiresWeight = resolvedMember.is_competition_member || isWeightRequiredGroup(effectiveGroupName)
    if (requiresWeight) {
      const parsedWeight = parseWeightInput(body.weight ?? "")
      if (parsedWeight == null || parsedWeight <= 30) {
        if (isDev) {
          console.log("Missing weight for member", resolvedMember.id)
        }
      }
    }

    const [
      { count: existingCheckinCountRaw, error: countError },
      { data: todayCheckinRow, error: todayError },
    ] = await Promise.all([
      supabase
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("member_id", resolvedMember.id),
      supabase
        .from("checkins")
        .select("id")
        .eq("member_id", resolvedMember.id)
        .eq("date", liveDate)
        .limit(1)
        .maybeSingle(),
    ])

    if (countError) throw countError
    if (todayError) throw todayError

    const existingCheckinCount = existingCheckinCountRaw ?? 0
    const hasCheckedInToday = Boolean(todayCheckinRow)

    const checkinResult = await handleCheckin(
      {
        id: resolvedMember.id,
        is_trial: Boolean(resolvedMember.is_trial),
        is_approved: Boolean(resolvedMember.is_approved),
        email_verified: Boolean(resolvedMember.email_verified),
        base_group: resolvedMember.base_group ?? null,
        member_phase: typeof resolvedMember.member_phase === "string" ? resolvedMember.member_phase : null,
      },
      {
        source: "form",
        mode: checkinMode,
      },
      existingCheckinCount,
      hasCheckedInToday,
      {
        activeSession: checkinAssignment.session,
        disableCheckinTimeWindow: bypassTimeWindow,
        groupAllowed: Boolean(effectiveGroupName),
      }
    )
    if (isDev) {
      console.log("CHECKIN CORE RESULT", checkinResult)
    }

    // TEMP LIVE MONITORING
    if (!checkinResult.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn('[member-flow][checkin][blocked] reason=' + (checkinResult.reason || 'unknown') + ' id=' + resolvedMember.id)
      }
      return jsonResponse(
        {
          ok: false,
          error: checkinResult.error || "Check-in fehlgeschlagen",
          reason: checkinResult.reason,
        },
        400
      )
    }

    if (hasCheckedInToday) {
      return jsonResponse(
        {
          ok: false,
          error: "Heute bereits eingecheckt",
          reason: "DUPLICATE",
        },
        400
      )
    }

    if (isDev) {
      console.log("CHECKIN INSERT DATA", {
        memberId: resolvedMember.id,
        groupName: effectiveGroupName,
        session: checkinAssignment?.session,
      })
    }

    try {
      await createCheckin({
        member_id: resolvedMember.id,
        group_name: effectiveGroupName ?? "",
        checkin_mode: checkinMode,
        weight: requiresWeight ? body.weight?.trim() : undefined,
        date: liveDate,
        time: timeString(now),
        year: currentYear,
        month_key: currentMonthKey,
      })
    } catch (error: any) {
      if (error) {
        console.error("DB INSERT ERROR FULL", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })
      }
      console.error("CHECKIN INSERT ERROR", error)
      throw error
    }

    // Gewichtspflicht-Logik nach erfolgreichem Check-in
    let requires_weight_entry_today = false
    let weight_already_recorded_today = false
    if (resolvedMember.is_competition_member || isWeightRequiredGroup(effectiveGroupName)) {
      requires_weight_entry_today = true
      // Prüfe, ob heute ein Check-in mit Gewicht existiert
      const { data: todayWeightRows, error: todayWeightError } = await supabase
        .from("checkins")
        .select("id, weight")
        .eq("member_id", resolvedMember.id)
        .eq("date", liveDate)
        .not("weight", "is", null)
        .limit(1)
      if (todayWeightError) throw todayWeightError
      weight_already_recorded_today = Array.isArray(todayWeightRows) && todayWeightRows.length > 0
    }

    const shouldRememberDevice = Boolean(body.rememberDevice)
    const rememberToken = shouldRememberDevice
      ? await createMemberDeviceToken({
          memberId: resolvedMember.id,
          firstName: resolvedMember.first_name?.trim() || "",
          lastName: resolvedMember.last_name?.trim() || "",
          isCompetitionMember: Boolean(resolvedMember.is_competition_member),
        })
      : null

    const response = NextResponse.json({
      ok: true,
      rememberedDevice: shouldRememberDevice,
      rememberUntil: shouldRememberDevice ? Date.now() + getMemberDeviceSessionMaxAgeMs() : null,
      member: shouldRememberDevice
        ? {
            id: resolvedMember.id,
            firstName: resolvedMember.first_name?.trim() || "",
            lastName: resolvedMember.last_name?.trim() || "",
            baseGroup: normalizeTrainingGroup(resolvedMember.base_group) || resolvedMember.base_group || "",
            isCompetitionMember: Boolean(resolvedMember.is_competition_member),
          }
        : null,
      requires_weight_entry_today,
      weight_already_recorded_today,
    })
    logResponseStatus(response.status)

    // TEMP LIVE MONITORING
    if (process.env.NODE_ENV !== "production") {
      console.info('[member-flow][checkin][success] id=' + resolvedMember.id)
    }
    if (shouldRememberDevice && rememberToken) {
      return applyMemberDeviceCookie(response, rememberToken)
    }
    return clearMemberDeviceCookie(response)
  } catch (error: any) {
    let masked = ''
    try {
      const req = error?.body || error?.requestBody || ''
      if (typeof req === 'string' && req.includes('@')) masked = ' email=' + maskEmail(req)
    } catch {}
    if (process.env.NODE_ENV !== "production") {
      console.error('[member-flow][checkin][error] reason=exception' + masked, error)
    }
    if (process.env.NODE_ENV !== "production") {
      console.log("CHECKIN RESPONSE STATUS", 500)
    }
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
