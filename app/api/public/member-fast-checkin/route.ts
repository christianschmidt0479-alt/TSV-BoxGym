import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createCheckin, findMemberById } from "@/lib/boxgymDb"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { handleCheckin } from "@/lib/checkinCore"
import {
  applyMemberDeviceCookie,
  clearMemberDeviceCookie,
  createMemberDeviceToken,
  getMemberDeviceSessionMaxAgeMs,
  readMemberDeviceTokenFromHeaders,
  verifyMemberDeviceToken,
} from "@/lib/memberDeviceSession"
import { getMemberCheckinMode, getSessionsForDate, resolveMemberCheckinAssignment, checkMemberEligibility } from "@/lib/memberCheckin"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

const supabase = createServerSupabaseServiceClient()

type MemberFastCheckinBody = {
  qrAccessToken?: string
  token?: string
  sessionId?: string
  weight?: string
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
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as MemberFastCheckinBody
    const rateLimit = await checkRateLimitAsync(`public-member-fast-checkin:${getRequestIp(request)}`, 25, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const token = body.token?.trim() || readMemberDeviceTokenFromHeaders(request) || ""
    if (!token) {
      const response = new NextResponse("Gerät wurde nicht erkannt. Bitte normal einchecken.", { status: 400 })
      return clearMemberDeviceCookie(response)
    }

    const deviceSession = await verifyMemberDeviceToken(token)
    if (!deviceSession) {
      const response = new NextResponse("Gespeicherter Schnell-Check-in ist abgelaufen. Bitte erneut normal einchecken.", { status: 401 })
      return clearMemberDeviceCookie(response)
    }

    const member = (await findMemberById(deviceSession.memberId)) as MemberRecord | null
    if (!member) {
      const response = new NextResponse("Gespeichertes Mitglied wurde nicht gefunden. Bitte erneut normal einchecken.", { status: 404 })
      return clearMemberDeviceCookie(response)
    }

    const now = new Date()
    const liveDate = todayString(now)
    const currentYear = new Date(`${liveDate}T12:00:00`).getFullYear()
    const currentMonthKey = getMonthKey(liveDate)
    const todaysSessions = getSessionsForDate(liveDate)
    const checkinSettings = await readCheckinSettings()
    const checkinMode = getMemberCheckinMode(checkinSettings.disableCheckinTimeWindow)


    const checkinAssignment = resolveMemberCheckinAssignment({
      dailySessions: todaysSessions,
      now,
      baseGroup: member.base_group,
      mode: checkinMode,
    })

    // Eligibility-Prüfung (zentral, produktiv)
    const eligibility = checkMemberEligibility({
      member,
      groupAllowed: Boolean(checkinAssignment.allowed && checkinAssignment.groupName),
      timeAllowed: Boolean(checkinAssignment.allowed && checkinAssignment.groupName),
    })
    if (!eligibility.eligible) {
      // Minimal Logging
      if (process.env.NODE_ENV !== "production") {
        console.warn("[checkin] rejected", {
          route: "/api/public/member-fast-checkin",
          member_id: member?.id,
          reason: eligibility.reason,
        })
      }
      return NextResponse.json({
        ok: false,
        reason: eligibility.reason,
      }, { status: 400 })
    }

    const requiresWeight = member.is_competition_member || checkinAssignment.groupName === "L-Gruppe"
    if (requiresWeight) {
      const parsedWeight = parseWeightInput(body.weight ?? "")
      if (parsedWeight == null || parsedWeight <= 30) {
        return new NextResponse("Bitte für die L-Gruppe ein aktuelles Gewicht über 30 kg angeben.", { status: 400 })
      }
    }

    const { data: existingMemberCheckins, error: existingMemberCheckinsError } = await supabase
      .from("checkins")
      .select("id, date, created_at")
      .eq("member_id", member.id)

    if (existingMemberCheckinsError) throw existingMemberCheckinsError

    const existingCheckinCount = existingMemberCheckins?.length ?? 0
    const hasCheckedInToday = (existingMemberCheckins ?? []).some((checkin) => {
      const checkinDate = checkin.date
      if (typeof checkinDate === "string" && checkinDate === liveDate) {
        return true
      }

      if (typeof checkin.created_at === "string") {
        return todayString(new Date(checkin.created_at)) === liveDate
      }

      return false
    })

    const checkinResult = await handleCheckin(
      {
        id: member.id,
        is_trial: Boolean(member.is_trial),
        is_approved: Boolean(member.is_approved),
        email_verified: Boolean(member.email_verified),
        base_group: member.base_group ?? null,
        member_phase: typeof member.member_phase === "string" ? member.member_phase : null,
      },
      {
        source: "fast",
        mode: checkinMode,
      },
      existingCheckinCount,
      hasCheckedInToday,
      {
        activeSession: checkinAssignment.session,
        disableCheckinTimeWindow: Boolean(checkinSettings.disableCheckinTimeWindow),
        groupAllowed: checkinSettings.disableCheckinTimeWindow
          ? true
          : Boolean(checkinAssignment.groupName),
      }
    )

    if (!checkinResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: checkinResult.error || "Check-in fehlgeschlagen",
          reason: checkinResult.reason,
        },
        { status: 400 }
      )
    }

    if (hasCheckedInToday) {
      return NextResponse.json(
        {
          ok: false,
          error: "Heute bereits eingecheckt",
          reason: "DUPLICATE",
        },
        { status: 400 }
      )
    }

    await createCheckin({
      member_id: member.id,
      group_name: checkinAssignment.groupName ?? "",
      checkin_mode: checkinMode,
      weight: requiresWeight ? body.weight?.trim() : undefined,
      date: liveDate,
      time: timeString(now),
      year: currentYear,
      month_key: currentMonthKey,
    })

    const refreshedToken = await createMemberDeviceToken({
      memberId: member.id,
      firstName: member.first_name?.trim() || deviceSession.firstName,
      lastName: member.last_name?.trim() || deviceSession.lastName,
      isCompetitionMember: Boolean(member.is_competition_member),
    })

    const response = NextResponse.json({
      ok: true,
      rememberUntil: Date.now() + getMemberDeviceSessionMaxAgeMs(),
      member: {
        id: member.id,
        firstName: member.first_name?.trim() || deviceSession.firstName,
        lastName: member.last_name?.trim() || deviceSession.lastName,
        baseGroup: normalizeTrainingGroup(member.base_group) || member.base_group || "",
        isCompetitionMember: Boolean(member.is_competition_member),
      },
    })

    return applyMemberDeviceCookie(response, refreshedToken)
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("public member fast checkin failed", error)
    }
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}

export async function GET(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const token = readMemberDeviceTokenFromHeaders(request)
  const deviceSession = await verifyMemberDeviceToken(token)
  if (!deviceSession) {
    const response = NextResponse.json({ remembered: false })
    return clearMemberDeviceCookie(response)
  }

  const member = (await findMemberById(deviceSession.memberId)) as MemberRecord | null
  if (!member) {
    const response = NextResponse.json({ remembered: false })
    return clearMemberDeviceCookie(response)
  }

  return NextResponse.json({
    remembered: true,
    rememberUntil: deviceSession.exp * 1000,
    member: {
      id: member.id,
      firstName: member.first_name?.trim() || deviceSession.firstName,
      lastName: member.last_name?.trim() || deviceSession.lastName,
      baseGroup: normalizeTrainingGroup(member.base_group) || member.base_group || "",
      isCompetitionMember: Boolean(member.is_competition_member),
    },
  })
}

export async function DELETE(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  return clearMemberDeviceCookie(response)
}
