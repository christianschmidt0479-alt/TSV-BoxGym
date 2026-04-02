import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createCheckin, findMemberByEmailAndPin } from "@/lib/boxgymDb"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { isSessionOpenForCheckin } from "@/lib/checkinWindow"
import { applyMemberDeviceCookie, clearMemberDeviceCookie, createMemberDeviceToken, getMemberDeviceSessionMaxAgeMs } from "@/lib/memberDeviceSession"
import { readQrAccessFromHeaders } from "@/lib/qrAccess"
import { sessions } from "@/lib/boxgymSessions"
import { isValidPin, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"
import { supabase } from "@/lib/supabaseClient"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

type MemberCheckinBody = {
  email?: string
  pin?: string
  weight?: string
  sessionId?: string
  rememberDevice?: boolean
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

function getDayKey(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`)
  const day = date.getDay()

  switch (day) {
    case 1:
      return "Montag"
    case 2:
      return "Dienstag"
    case 3:
      return "Mittwoch"
    case 4:
      return "Donnerstag"
    case 5:
      return "Freitag"
    default:
      return ""
  }
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

    const qrAccess = await readQrAccessFromHeaders(request)
    if (!qrAccess || qrAccess.panel !== "member") {
      return new NextResponse("QR-Zugang erforderlich.", { status: 403 })
    }

    const body = (await request.json()) as MemberCheckinBody
    const email = body.email?.trim().toLowerCase() ?? ""
    const pin = body.pin?.trim() ?? ""
    const rateLimit = await checkRateLimitAsync(
      `public-member-checkin:${getRequestIp(request)}:${email || "__email__"}`,
      25,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const now = new Date()
    const liveDate = todayString(now)
    const currentYear = new Date(`${liveDate}T12:00:00`).getFullYear()
    const currentMonthKey = getMonthKey(liveDate)
    const todaysSessions = sessions.filter((session) => session.dayKey === getDayKey(liveDate))
    const selectedSession = todaysSessions.find((session) => session.id === body.sessionId) ?? null
    const selectedGroup = normalizeTrainingGroup(selectedSession?.group)

    if (!email || !pin) {
      return new NextResponse("Bitte E-Mail und PIN eingeben.", { status: 400 })
    }

    if (!isValidPin(pin)) {
      return new NextResponse(PIN_REQUIREMENTS_MESSAGE, { status: 400 })
    }

    if (!selectedSession) {
      return new NextResponse("Bitte eine Trainingsgruppe auswaehlen.", { status: 400 })
    }

    const checkinSettings = await readCheckinSettings()
    if (!checkinSettings.disableCheckinTimeWindow && !isSessionOpenForCheckin(selectedSession, now)) {
      return new NextResponse("Check-in aktuell nur 30 Minuten vor bis 30 Minuten nach Trainingsbeginn moeglich.", { status: 400 })
    }

    const memberMatch = await findMemberByEmailAndPin(email, pin)
    if (memberMatch?.status === "missing_email") {
      return new NextResponse("Mitglied nicht gefunden oder PIN nicht korrekt.", { status: 401 })
    }
    const resolvedMember = (memberMatch?.status === "success" ? memberMatch.member : null) as MemberRecord | null

    if (!resolvedMember) {
      return new NextResponse("Mitglied nicht gefunden oder PIN nicht korrekt.", { status: 401 })
    }

    if (resolvedMember.is_competition_member) {
      const parsedWeight = parseWeightInput(body.weight ?? "")
      if (parsedWeight == null || parsedWeight <= 30) {
        return new NextResponse("Bitte fuer Wettkaempfer ein aktuelles Gewicht ueber 30 kg angeben.", { status: 400 })
      }
    }

    if (!resolvedMember.email_verified) {
      return new NextResponse("E-Mail noch nicht bestaetigt. Bitte zuerst den Bestaetigungslink oeffnen.", { status: 400 })
    }

    const { data: existingMemberCheckins, error: existingMemberCheckinsError } = await supabase
      .from("checkins")
      .select("id")
      .eq("member_id", resolvedMember.id)

    if (existingMemberCheckinsError) throw existingMemberCheckinsError

    const existingCheckinCount = existingMemberCheckins?.length ?? 0

    if (resolvedMember.is_trial && existingCheckinCount >= 3) {
      return new NextResponse("Probemitglieder koennen maximal 3 Trainingseinheiten absolvieren.", { status: 400 })
    }

    if (!resolvedMember.is_trial && !resolvedMember.is_approved && existingCheckinCount >= 6) {
      return new NextResponse("Ohne Admin-Freigabe sind maximal 6 Trainingseinheiten moeglich. Bitte Trainer oder Admin ansprechen.", { status: 400 })
    }

    await createCheckin({
      member_id: resolvedMember.id,
      group_name: selectedGroup || selectedSession.group,
      weight: resolvedMember.is_competition_member ? body.weight?.trim() : undefined,
      date: liveDate,
      time: timeString(now),
      year: currentYear,
      month_key: currentMonthKey,
    })

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
            isCompetitionMember: Boolean(resolvedMember.is_competition_member),
          }
        : null,
    })

    if (shouldRememberDevice && rememberToken) {
      return applyMemberDeviceCookie(response, rememberToken)
    }

    return clearMemberDeviceCookie(response)
  } catch (error) {
    console.error("public member checkin failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
