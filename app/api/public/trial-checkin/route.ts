import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createCheckin, findMemberByFirstLastAndBirthdate, updateMemberProfile } from "@/lib/boxgymDb"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { handleCheckin, type Context } from "@/lib/checkinCore"
import { getSessionsForDate } from "@/lib/memberCheckin"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

const supabase = createServerSupabaseServiceClient()

type TrialCheckinBody = {
  firstName?: string
  lastName?: string
  birthDate?: string
  email?: string
  phone?: string
  source?: string
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

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as TrialCheckinBody
    // QR-Token ist für Probetraining nicht mehr erforderlich
    // Die Prüfung wird entfernt, damit Probetraining-Checkins immer möglich sind
    // (Mitglied-Checkin bleibt weiterhin QR-geschützt)

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
      return NextResponse.json({ ok: false, error: "Bitte Vorname und Nachname eingeben." }, { status: 400 })
    }

    if (!birthDate) {
      return NextResponse.json({ ok: false, error: "Bitte Geburtsdatum angeben." }, { status: 400 })
    }

    if (!email) {
      return NextResponse.json({ ok: false, error: "Bitte E-Mail angeben." }, { status: 400 })
    }

    if (!phone) {
      return NextResponse.json({ ok: false, error: "Bitte Telefonnummer angeben." }, { status: 400 })
    }

    if (!selectedSession) {
      return NextResponse.json({ ok: false, error: "Bitte eine Trainingsgruppe auswählen." }, { status: 400 })
    }

    const checkinSettings = await readCheckinSettings()
    const checkinMode: Context["mode"] = checkinSettings.disableCheckinTimeWindow ? "ferien" : "normal"

    const member = await findMemberByFirstLastAndBirthdate(firstName, lastName, birthDate)

    if (!member) {
      // TEMP LIVE MONITORING
      if (process.env.NODE_ENV !== "production") {
        console.warn("[trial-flow][checkin][blocked] reason=not_registered")
      }
      return NextResponse.json(
        {
          ok: false,
          error: "Mitglied nicht vorhanden - bitte zuerst registrieren.",
        },
        { status: 404 }
      )
    }

    if (!member.is_trial) {
      // TEMP LIVE MONITORING
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[trial-flow][checkin][blocked] reason=member_already_exists id=${member.id}`)
      }
      return NextResponse.json(
        {
          ok: false,
          error: "Diese Person ist bereits als Mitglied erfasst. Probetraining darf bestehende Mitgliedsdaten nicht ändern.",
        },
        { status: 409 }
      )
    }

    const trialMember = await updateMemberProfile(member.id, {
      email,
      phone,
    })

    const { data: memberCheckins, error: memberCheckinsError } = await supabase
      .from("checkins")
      .select("id, created_at")
      .eq("member_id", member.id)

    if (memberCheckinsError) throw memberCheckinsError

    const memberCheckinCount = memberCheckins?.length ?? 0
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const hasCheckedInToday = (memberCheckins ?? []).some((checkin) => {
      const checkinDate = new Date(checkin.created_at)
      checkinDate.setHours(0, 0, 0, 0)
      return checkinDate.getTime() === todayStart.getTime()
    })

    const requestedSource = (body.source ?? "").trim().toLowerCase()
    const source: Context["source"] = requestedSource === "qr" || requestedSource === "form"
      ? requestedSource
      : "form"

    const result = await handleCheckin(
      {
        id: trialMember.id,
        is_trial: Boolean(trialMember.is_trial),
        is_approved: Boolean(trialMember.is_approved),
        email_verified: Boolean(trialMember.email_verified),
        base_group: trialMember.base_group,
        member_phase: typeof trialMember.member_phase === "string" ? trialMember.member_phase : null,
      },
      {
        source,
        mode: checkinMode,
      },
      memberCheckinCount,
      hasCheckedInToday
    )

    // TEMP LIVE MONITORING
    if (!result.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[trial-flow][checkin][blocked] reason=${result.reason || "unknown"} id=${trialMember.id}`)
      }
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "Check-in fehlgeschlagen",
          reason: result.reason,
        },
        { status: 400 }
      )
    }

    if (hasCheckedInToday) {
      // TEMP LIVE MONITORING
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[trial-flow][checkin][blocked] reason=DUPLICATE id=${trialMember.id}`)
      }
      return NextResponse.json(
        {
          ok: false,
          error: "Heute bereits eingecheckt",
          reason: "DUPLICATE",
        },
        { status: 400 }
      )
    }

    const createdCheckin = await createCheckin({
      member_id: trialMember.id,
      group_name: selectedSession.group,
      checkin_mode: checkinMode,
      date: liveDate,
      time: timeString(now),
      year: currentYear,
      month_key: currentMonthKey,
    })

    // TEMP LIVE MONITORING
    if (process.env.NODE_ENV !== "production") {
      console.info(`[trial-flow][checkin][success] id=${trialMember.id}`)
    }

    return NextResponse.json({
      ok: true,
      checkinId: createdCheckin.id,
    })
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("public trial checkin failed", error)
    }
    return NextResponse.json({ ok: false, error: "Interner Fehler" }, { status: 500 })
  }
}
