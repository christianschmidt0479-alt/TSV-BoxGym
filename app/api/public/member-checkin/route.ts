import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createCheckin, findMemberByEmailAndPin, findMemberByFirstLastAndBirthdate } from "@/lib/boxgymDb"
import { createMemberDeviceToken, getMemberDeviceSessionMaxAgeMs } from "@/lib/memberDeviceSession"
import { sessions } from "@/lib/boxgymSessions"
import { supabase } from "@/lib/supabaseClient"

type MemberCheckinBody = {
  firstName?: string
  lastName?: string
  email?: string
  pin?: string
  birthDate?: string
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

const MEMBER_LOGIN_SECRET_REGEX = /^[A-Za-z0-9]{6,16}$/

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

    const rateLimit = checkRateLimit(`public-member-checkin:${getRequestIp(request)}`, 25, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as MemberCheckinBody
    const firstName = body.firstName?.trim() ?? ""
    const lastName = body.lastName?.trim() ?? ""
    const email = body.email?.trim().toLowerCase() ?? ""
    const pin = body.pin?.trim() ?? ""
    const birthDate = body.birthDate ?? ""
    const now = new Date()
    const liveDate = todayString(now)
    const currentYear = new Date(`${liveDate}T12:00:00`).getFullYear()
    const currentMonthKey = getMonthKey(liveDate)
    const todaysSessions = sessions.filter((session) => session.dayKey === getDayKey(liveDate))
    const selectedSession = todaysSessions.find((session) => session.id === body.sessionId) ?? null
    const isBoxzwergeCheckin = selectedSession?.group === "Boxzwerge"

    if (!isBoxzwergeCheckin && (!email || !pin)) {
      return new NextResponse("Bitte E-Mail und PIN eingeben.", { status: 400 })
    }

    if (isBoxzwergeCheckin && (!firstName || !lastName)) {
      return new NextResponse("Bitte Vorname und Nachname eingeben.", { status: 400 })
    }

    if (isBoxzwergeCheckin && !birthDate) {
      return new NextResponse("Bitte das Geburtsdatum des Boxzwergs eingeben.", { status: 400 })
    }

    if (!isBoxzwergeCheckin && !MEMBER_LOGIN_SECRET_REGEX.test(pin)) {
      return new NextResponse("Die PIN muss 6 bis 16 Zeichen lang sein und darf nur Buchstaben und Zahlen enthalten.", { status: 400 })
    }

    // TESTPHASE: Zeitfenster fuer Mitglieder-Check-ins spaeter wieder aktivieren.
    if (!selectedSession) {
      return new NextResponse("Bitte eine Trainingsgruppe auswaehlen.", { status: 400 })
    }

    const member = (isBoxzwergeCheckin
      ? await findMemberByFirstLastAndBirthdate(firstName, lastName, birthDate)
      : null) as MemberRecord | null

    let resolvedMember = member
    if (!isBoxzwergeCheckin) {
      const memberMatch = await findMemberByEmailAndPin(email, pin)
      if (memberMatch?.status === "missing_email") {
        return new NextResponse("Für dieses Konto ist noch keine E-Mail-Adresse hinterlegt. Bitte Trainer oder Admin ansprechen.", { status: 409 })
      }
      resolvedMember = (memberMatch?.status === "success" ? memberMatch.member : null) as MemberRecord | null
    }

    if (!resolvedMember) {
      return new NextResponse(
        isBoxzwergeCheckin
          ? "Boxzwerg nicht gefunden. Bitte Vorname, Nachname und Geburtsdatum pruefen."
          : "Mitglied nicht gefunden oder PIN nicht korrekt.",
        { status: 404 }
      )
    }

    if (isBoxzwergeCheckin && resolvedMember.base_group !== "Boxzwerge") {
      return new NextResponse("Dieses Kind ist nicht in der Gruppe Boxzwerge registriert.", { status: 400 })
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
      group_name: selectedSession.group,
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

    return NextResponse.json({
      ok: true,
      rememberedDevice: shouldRememberDevice,
      rememberToken,
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
  } catch (error) {
    console.error("public member checkin failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
