import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { enqueueAdminNotification } from "@/lib/adminDigestDb"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createCheckin, createMember, findMemberByFirstLastAndBirthdate, updateMemberProfile, updateMemberRegistrationData } from "@/lib/boxgymDb"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { handleCheckin } from "@/lib/checkinCore"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { getSessionsForDate } from "@/lib/memberCheckin"
import { sendVerificationEmail } from "@/lib/resendClient"
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
    const checkinMode = checkinSettings.disableCheckinTimeWindow ? "ferien" : "normal"

    let member = await findMemberByFirstLastAndBirthdate(firstName, lastName, birthDate)
    let isNewTrialMember = false

    if (!member) {
      member = await createMember({
        first_name: firstName,
        last_name: lastName,
        birthdate: birthDate,
        email,
        phone,
        is_trial: true,
        is_approved: false,
        base_group: selectedSession.group,
      })
      isNewTrialMember = true
    } else if (!member.is_trial) {
      return NextResponse.json(
        {
          ok: false,
          error: "Diese Person ist bereits als Mitglied erfasst. Probetraining darf bestehende Mitgliedsdaten nicht ändern.",
        },
        { status: 409 }
      )
    }

    if (member.is_trial) {
      member = await updateMemberProfile(member.id, {
        email,
        phone,
      })
    }

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

    let source = (body.source ?? "").trim().toLowerCase()
    if (source !== "qr" && source !== "form") {
      source = "form"
    }

    const result = await handleCheckin(
      {
        id: member.id,
        is_trial: Boolean(member.is_trial),
        is_approved: Boolean(member.is_approved),
        email_verified: Boolean(member.email_verified),
        base_group: member.base_group,
      },
      {
        source,
        mode: checkinMode,
      },
      memberCheckinCount,
      hasCheckedInToday
    )

    if (!result.ok) {
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
      member_id: member.id,
      group_name: selectedSession.group,
      checkin_mode: checkinMode,
      date: liveDate,
      time: timeString(now),
      year: currentYear,
      month_key: currentMonthKey,
    })

    if (isNewTrialMember) {
      const emailToken = randomUUID()
      try {
        await updateMemberRegistrationData(member.id, {
          email_verified: false,
          email_verified_at: null,
          email_verification_token: emailToken,
        })
      } catch (tokenError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("trial verification token update failed", tokenError)
        }
      }

      const verificationBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
      const verificationLink = `${verificationBaseUrl}/mein-bereich?verify=${emailToken}`

      try {
        await sendVerificationEmail({
          email,
          name: `${firstName} ${lastName}`.trim(),
          link: verificationLink,
          kind: "member",
        })
      } catch (mailError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("trial verification mail failed", mailError)
        }
      }

      try {
        await enqueueAdminNotification({
          kind: "member",
          memberName: `${firstName} ${lastName} (Probetraining)`,
          email,
          group: selectedSession.group,
        })
      } catch (notifyError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("trial admin notification failed", notifyError)
        }
      }
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
