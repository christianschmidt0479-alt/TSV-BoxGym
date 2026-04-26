import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { handleCheckin, type Context } from "@/lib/checkinCore"
import { signDeviceToken, verifyDeviceToken } from "@/lib/deviceToken"
import { verifyTrainerSessionToken } from "@/lib/authSession"
import { findMemberByEmailAndPin } from "@/lib/boxgymDb"

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
  const { hour, minute } = getBerlinDateParts(date)
  return `${hour}:${minute}`
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

type MemberCheckinRecord = {
  id: string
  email_verified: boolean | null
  is_approved: boolean | null
  is_trial: boolean | null
  base_group: string | null
  member_pin: string | null
  member_phase: string | null
}

/**
 * POST /api/checkin/member
 * Member Check-in mit zentraler Core-Logik und Sicherheitsüberprüfungen
 *
 * Body: { email?: string, pin?: string, source?: string, entry?: string, deviceToken?: string }
 *
 * Security:
 * - source: validated server-side against allowlist (not trusted from client)
 * - entry: optional, validated server-side (future: QR token hardening)
 * - context (source, mode): built entirely server-side
 *
 * Erfolgreich: 200 { ok: true, checkinId: string }
 * Fehler: 400/401/429/403 mit Fehlermeldung
 */
export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as {
      email?: string
      pin?: string
      source?: string
      entry?: string
      deviceToken?: string
      memberId?: string
    }
    const normalizedEmail = body.email?.trim().toLowerCase() ?? ""
    const pin = body.pin?.trim() ?? ""
    const deviceToken = body.deviceToken?.trim() ?? ""
    const memberId = body.memberId?.trim() ?? ""

    // ========================================================================
    // SECURITY: VALIDATE SOURCE (allowlist, not trusted from client)
    // ========================================================================
    const requestedSource = (body.source ?? "").trim().toLowerCase()
    const source: Context["source"] =
      requestedSource === "qr" ||
      requestedSource === "nfc" ||
      requestedSource === "form" ||
      requestedSource === "trainer"
        ? requestedSource
        : "qr"

    // ========================================================================
    // SECURITY: VALIDATE ENTRY (optional, hardening for QR integration)
    // ========================================================================
    const ALLOWED_ENTRIES = ["gym"] as const
    const entry = body.entry && ALLOWED_ENTRIES.includes(body.entry as any) ? body.entry : null
    // Future: validate entry token against QR token store

    // ========================================================================
    // LOAD MEMBER
    // ========================================================================
    const supabase = createServerSupabaseServiceClient()
    let member: MemberCheckinRecord | null = null

    if (source === "trainer") {
      const session = (await cookies()).get("trainer_session")

      if (!session) {
        return NextResponse.json(
          { ok: false, error: "Nicht autorisiert" },
          { status: 401 }
        )
      }

      const trainer = await verifyTrainerSessionToken(session.value)

      if (!trainer) {
        return NextResponse.json(
          { ok: false, error: "Session ungültig" },
          { status: 401 }
        )
      }
    }

    // Trainer flow: direct member lookup by memberId (still validated by core).
    if (source === "trainer" && memberId) {
      const { data: trainerMember, error: trainerMemberError } = await supabase
        .from("members")
        .select("id, email_verified, is_approved, is_trial, base_group, member_pin, member_phase")
        .eq("id", memberId)
        .maybeSingle()

      if (trainerMemberError) throw trainerMemberError
      member = trainerMember

      if (!member) {
        return NextResponse.json(
          { ok: false, error: "Mitglied nicht gefunden." },
          { status: 404 }
        )
      }
    }

    // Fast device-token flow.
    if (!member && deviceToken) {
      const tokenCheck = verifyDeviceToken(deviceToken)
      if (tokenCheck.valid && tokenCheck.memberId) {
        const { data: tokenMember, error: tokenMemberError } = await supabase
          .from("members")
          .select("id, email_verified, is_approved, is_trial, base_group, member_pin, member_phase")
          .eq("id", tokenCheck.memberId)
          .maybeSingle()

        if (tokenMemberError) throw tokenMemberError
        member = tokenMember
      }
    }

    // Fallback to standard email + pin login.
    if (!member) {
      if (!normalizedEmail || !pin) {
        return NextResponse.json(
          { ok: false, error: "Bitte E-Mail und PIN eingeben." },
          { status: 400 }
        )
      }

      const rateLimit = await checkRateLimitAsync(
        `member-checkin:${getRequestIp(request)}:${normalizedEmail}`,
        20,
        10 * 60 * 1000
      )
      if (!rateLimit.ok) {
        return NextResponse.json(
          { ok: false, error: "Zu viele Versuche. Bitte warte kurz." },
          { status: 429 }
        )
      }

      const loginMatch = await findMemberByEmailAndPin(normalizedEmail, pin)

      if (!loginMatch || loginMatch.status !== "success") {
        return NextResponse.json(
          { ok: false, error: "Mitglied nicht gefunden oder PIN falsch." },
          { status: 401 }
        )
      }

      member = loginMatch.member as MemberCheckinRecord
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("CHECKIN MEMBER:", member.id)
    }

    // ========================================================================
    // CALCULATE CHECK-IN COUNT & DUPLICATE CHECK
    // ========================================================================
    const { data: allCheckins, error: checkinsError } = await supabase
      .from("checkins")
      .select("id, created_at")
      .eq("member_id", member.id)

    if (checkinsError) throw checkinsError

    const memberCheckinCount = allCheckins?.length ?? 0

    // Check if already checked in today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const hasCheckedInToday = (allCheckins ?? []).some((checkin) => {
      const checkinDate = new Date(checkin.created_at)
      checkinDate.setHours(0, 0, 0, 0)
      return checkinDate.getTime() === today.getTime()
    })

    // ========================================================================
    // SECURITY: DETERMINE MODE (server-side only, not from client)
    // ========================================================================
    // Mode is always determined server-side from Settings
    // This prevents client-side tampering with ferienmodus flag
    const settings = await readCheckinSettings()
    const mode: Context["mode"] = settings.disableCheckinTimeWindow ? "ferien" : "normal"

    // ========================================================================
    // BUILD CONTEXT (server-side only, all values validated/computed here)
    // ========================================================================
    // CONTEXT IS NEVER TRUSTED FROM CLIENT
    // - source: from allowlist (validated above)
    // - mode: from Settings (computed above)
    // - entry: optional, validated above
    // All core decision logic uses this server-built context
    const context: Context = {
      source,
      mode,
    }

    // ========================================================================
    // CORE DECISION LOGIC
    // ========================================================================
    const result = await handleCheckin(
      {
        id: member.id,
        is_trial: member.is_trial ?? false,
        is_approved: member.is_approved ?? false,
        email_verified: member.email_verified ?? false,
        base_group: member.base_group,
        member_phase: member.member_phase,
      },
      context,
      memberCheckinCount,
      hasCheckedInToday
    )

    // ========================================================================
    // HANDLE CORE ERRORS
    // ========================================================================
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, reason: result.reason },
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

    // ========================================================================
    // INSERT CHECK-IN (only if core approved)
    // ========================================================================
    const now = new Date()
    const liveDate = todayString(now)
    const { data: checkinRecord, error: insertError } = await supabase
      .from("checkins")
      .insert({
        member_id: member.id,
        group_name: member.base_group,
        checkin_mode: mode,
        date: liveDate,
        time: timeString(now),
        year: Number(liveDate.slice(0, 4)),
        month_key: getMonthKey(liveDate),
        created_at: now.toISOString(),
      })
      .select("id")
      .single()

    if (insertError) throw insertError

    // ========================================================================
    // SUCCESS RESPONSE
    // ========================================================================
    return NextResponse.json({
      ok: true,
      checkinId: checkinRecord.id,
      deviceToken: signDeviceToken(member.id),
    })
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Member check-in error:", error)
    }
    return NextResponse.json(
      { ok: false, error: "Fehler beim Check-in" },
      { status: 500 }
    )
  }
}
