import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createCheckin, createMember, findMemberByFirstLastAndBirthdate, updateMemberProfile, updateTrialMember } from "@/lib/boxgymDb"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { isSessionOpenForCheckin } from "@/lib/checkinWindow"
import { getMemberCheckinMode, getSessionsForDate } from "@/lib/memberCheckin"
import { readQrAccessFromHeaders, verifyQrAccessToken } from "@/lib/qrAccess"
import { getQrAccessToken } from "@/lib/qrAccessServer"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

const supabase = createServerSupabaseServiceClient()

type TrialCheckinBody = {
  firstName?: string
  lastName?: string
  birthDate?: string
  email?: string
  phone?: string
  qrAccessToken?: string
  sessionId?: string
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

function hasLegacyQrAccessToken(token?: string) {
  try {
    return token?.trim() === getQrAccessToken()
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as TrialCheckinBody
    const qrAccess = (await readQrAccessFromHeaders(request)) ?? (await verifyQrAccessToken(body.qrAccessToken?.trim()))
    const hasLegacyAccess = hasLegacyQrAccessToken(body.qrAccessToken)
    if ((!qrAccess || qrAccess.panel !== "trial") && !hasLegacyAccess) {
      return new NextResponse("QR-Zugang erforderlich.", { status: 403 })
    }

    const firstName = body.firstName?.trim() ?? ""
    const lastName = body.lastName?.trim() ?? ""
    const birthDate = body.birthDate ?? ""
    const email = body.email?.trim() ?? ""
    const phone = body.phone?.trim() ?? ""
    const rateLimit = await checkRateLimitAsync(
      `public-trial-checkin:${getRequestIp(request)}:${email.toLowerCase() || "__email__"}`,
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
    const todaysSessions = getSessionsForDate(liveDate)
    const selectedSession = todaysSessions.find((session) => session.id === body.sessionId) ?? null

    if (!firstName || !lastName) {
      return new NextResponse("Bitte Vorname und Nachname eingeben.", { status: 400 })
    }

    if (!birthDate) {
      return new NextResponse("Bitte Geburtsdatum angeben.", { status: 400 })
    }

    if (!email) {
      return new NextResponse("Bitte E-Mail angeben.", { status: 400 })
    }

    if (!phone) {
      return new NextResponse("Bitte Telefonnummer angeben.", { status: 400 })
    }

    if (!selectedSession) {
      return new NextResponse("Bitte eine Trainingsgruppe auswählen.", { status: 400 })
    }

    const checkinSettings = await readCheckinSettings()
    const checkinMode = getMemberCheckinMode(checkinSettings.disableCheckinTimeWindow)

    if (checkinMode !== "ferien" && !isSessionOpenForCheckin(selectedSession, now)) {
      return new NextResponse("Check-in aktuell nur 30 Minuten vor bis 30 Minuten nach Trainingsbeginn möglich.", { status: 400 })
    }

    let member = await findMemberByFirstLastAndBirthdate(firstName, lastName, birthDate)

    if (!member) {
      member = await createMember({
        first_name: firstName,
        last_name: lastName,
        birthdate: birthDate,
        email,
        phone,
        is_trial: true,
        is_approved: true,
        base_group: selectedSession.group,
      })
    } else if (!member.is_trial) {
      return new NextResponse(
        "Diese Person ist bereits als Mitglied erfasst. Probetraining darf bestehende Mitgliedsdaten nicht ändern.",
        { status: 409 }
      )
    }

    const { data: trialCheckins, error: trialCheckinsError } = await supabase
      .from("checkins")
      .select("id")
      .eq("member_id", member.id)

    if (trialCheckinsError) throw trialCheckinsError

    const trialCheckinCount = trialCheckins?.length ?? 0
    if (member.is_trial && trialCheckinCount >= 3) {
      return new NextResponse("Probetraining erschoepft. Diese Person hat bereits 3 Probetrainings absolviert.", { status: 400 })
    }

    if (member.is_trial) {
      member = await updateTrialMember(member.id, trialCheckinCount + 1, email, phone)
    } else {
      member = await updateMemberProfile(member.id, {
        email,
        phone,
      })
    }

    await createCheckin({
      member_id: member.id,
      group_name: selectedSession.group,
      checkin_mode: checkinMode,
      date: liveDate,
      time: timeString(now),
      year: currentYear,
      month_key: currentMonthKey,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("public trial checkin failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
