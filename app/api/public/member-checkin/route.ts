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
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createCheckin, findMemberByEmailAndPin } from "@/lib/boxgymDb"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { handleCheckin } from "@/lib/checkinCore"
import { applyMemberDeviceCookie, clearMemberDeviceCookie, createMemberDeviceToken, getMemberDeviceSessionMaxAgeMs } from "@/lib/memberDeviceSession"
import { getMemberCheckinMode, getSessionsForDate, resolveMemberCheckinAssignment, checkMemberEligibility } from "@/lib/memberCheckin"
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
      if (process.env.NODE_ENV !== "production") {
        console.warn('[member-flow][checkin][error] reason=forbidden')
      }
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as MemberCheckinBody
    const email = body.email?.trim().toLowerCase() ?? ""
    const password = body.password?.trim() ?? body.pin?.trim() ?? ""
    const checkinSettings = await readCheckinSettings()
    const checkinMode = getMemberCheckinMode(checkinSettings.disableCheckinTimeWindow)

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
    const todaysSessions = getSessionsForDate(liveDate)
    if (!email || !password) {
      if (process.env.NODE_ENV !== "production") {
        console.warn('[member-flow][checkin][error] reason=missing_credentials email=' + maskEmail(email))
      }
      return new NextResponse("Bitte E-Mail und Passwort eingeben.", { status: 400 })
    }

    const memberMatch = await findMemberByEmailAndPin(email, password)
    if (memberMatch?.status === "missing_email") {
      if (process.env.NODE_ENV !== "production") {
        console.warn('[member-flow][checkin][error] reason=not_found email=' + maskEmail(email))
      }
      return new NextResponse("Mitglied nicht gefunden oder Passwort nicht korrekt.", { status: 401 })
    }
    const resolvedMember = (memberMatch?.status === "success" ? memberMatch.member : null) as MemberRecord | null

    if (!resolvedMember) {
      if (process.env.NODE_ENV !== "production") {
        console.warn('[member-flow][checkin][error] reason=not_found email=' + maskEmail(email))
      }
      return new NextResponse("Mitglied nicht gefunden oder Passwort nicht korrekt.", { status: 401 })
    }


    const checkinAssignment = resolveMemberCheckinAssignment({
      dailySessions: todaysSessions,
      now,
      baseGroup: resolvedMember.base_group,
      mode: checkinMode,
    })

    // Eligibility-Prüfung (zentral)
    const eligibility = checkMemberEligibility({
      member: resolvedMember,
      groupAllowed: Boolean(checkinAssignment.allowed && checkinAssignment.groupName),
      timeAllowed: Boolean(checkinAssignment.allowed && checkinAssignment.groupName), // Zeitfenster ist in groupAllowed enthalten
    })

    if (!eligibility.eligible) {
      if (process.env.NODE_ENV !== "production") {
        console.warn('[member-flow][checkin][error] reason=' + eligibility.reason + ' id=' + resolvedMember.id)
      }
      // Minimalfix C: Fehlertext für fehlende Verifizierung explizit
      if (eligibility.reason === "email_not_verified") {
        return new NextResponse("E-Mail noch nicht bestätigt. Bitte zuerst den Bestätigungslink aus der E-Mail öffnen.", { status: 400 })
      }
      return NextResponse.json({
        ok: false,
        reason: eligibility.reason,
      }, { status: 400 })
    }


    const requiresWeight = resolvedMember.is_competition_member || checkinAssignment.groupName === "L-Gruppe"
    if (requiresWeight) {
      const parsedWeight = parseWeightInput(body.weight ?? "")
      if (parsedWeight == null || parsedWeight <= 30) {
        if (process.env.NODE_ENV !== "production") {
          console.warn('[member-flow][checkin][error] reason=invalid_weight id=' + resolvedMember.id)
        }
        return new NextResponse("Bitte für die L-Gruppe ein aktuelles Gewicht über 30 kg angeben.", { status: 400 })
      }
    }

    const { data: existingMemberCheckins, error: existingMemberCheckinsError } = await supabase
      .from("checkins")
      .select("id, date, created_at")
      .eq("member_id", resolvedMember.id)

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
      hasCheckedInToday
    )

    // TEMP LIVE MONITORING
    if (!checkinResult.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn('[member-flow][checkin][blocked] reason=' + (checkinResult.reason || 'unknown') + ' id=' + resolvedMember.id)
      }
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
      member_id: resolvedMember.id,
      group_name: checkinAssignment.groupName ?? "",
      checkin_mode: checkinMode,
      weight: requiresWeight ? body.weight?.trim() : undefined,
      date: liveDate,
      time: timeString(now),
      year: currentYear,
      month_key: currentMonthKey,
    })

    // Gewichtspflicht-Logik nach erfolgreichem Check-in
    let requires_weight_entry_today = false
    let weight_already_recorded_today = false
    if (resolvedMember.is_competition_member || checkinAssignment.groupName === "L-Gruppe") {
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
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
