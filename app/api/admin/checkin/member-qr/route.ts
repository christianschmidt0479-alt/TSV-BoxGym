import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"
import { getTodayIsoDateInBerlin } from "@/lib/dateFormat"
import { getAvailableSessionsForToday, getMemberCheckinMode, getSessionsForDate, resolveMemberCheckinAssignment } from "@/lib/memberCheckin"
import { isWeightRequiredGroup } from "@/lib/memberUtils"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type RequestBody = {
  memberId?: string
  selectedGroup?: string
  weight?: string
}

type ApiResult = {
  status: "success" | "needs_selection" | "needs_weight" | "blocked" | "error"
  message: string
  reason?: string
  checkedInAt?: string
  groupName?: string
  availableGroups?: Array<{ group: string; time: string }>
  member?: {
    id: string
    first_name?: string | null
    last_name?: string | null
    name?: string | null
    base_group?: string | null
    is_approved?: boolean | null
    is_trial?: boolean | null
  }
}

function json(body: ApiResult, status = 200) {
  return NextResponse.json(body, { status })
}

async function readTodayCheckinSnapshot({
  supabase,
  memberId,
  date,
}: {
  supabase: ReturnType<typeof createServerSupabaseServiceClient>
  memberId: string
  date: string
}) {
  const { data, error } = await supabase
    .from("checkins")
    .select("time, group_name")
    .eq("member_id", memberId)
    .eq("date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return {
    checkedInAt: typeof data?.time === "string" ? data.time : undefined,
    groupName: typeof data?.group_name === "string" ? data.group_name : undefined,
  }
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    if (session.role !== "admin") {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-member-qr-checkin:${getRequestIp(request)}`, 30, 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as RequestBody
    const memberId = body.memberId?.trim() ?? ""
    if (!memberId) {
      return json({
        status: "error",
        message: "Mitglied-ID fehlt.",
        reason: "member_id_missing",
      }, 400)
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("[admin-scanner-checkin] attempt", {
        memberId,
        hasWeight: Boolean(body.weight?.trim()),
      })
    }

    const supabase = createServerSupabaseServiceClient()
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, name, first_name, last_name, base_group, is_approved, is_trial, is_competition_member")
      .eq("id", memberId)
      .maybeSingle()

    if (memberError) throw memberError

    if (!member) {
      return json({
        status: "error",
        message: "Mitglied nicht gefunden.",
        reason: "member_not_found",
      }, 404)
    }

    const checkinSettings = await readCheckinSettings()
    const now = new Date()
    const liveDate = getTodayIsoDateInBerlin(now)
    const dailySessions = getSessionsForDate(liveDate)
    const availableGroups = getAvailableSessionsForToday(liveDate)
    const checkinMode = getMemberCheckinMode(checkinSettings.disableCheckinTimeWindow)
    const disableNormalWindowForTest =
      !checkinSettings.disableCheckinTimeWindow && checkinSettings.disableNormalCheckinTimeWindow

    const assignment = resolveMemberCheckinAssignment({
      dailySessions,
      now,
      baseGroup: member.base_group,
      mode: checkinMode,
      selectedGroup: body.selectedGroup,
      availableGroups: availableGroups.map((row) => row.group),
      allowOutsideWindowGroupFallback: disableNormalWindowForTest,
    })

    if (assignment.reason === "no_own_session_today" && !assignment.groupName) {
      if (process.env.NODE_ENV !== "production") {
        console.info("[admin-scanner-checkin] result", { memberId, status: "needs_selection", reason: "no_own_session_today" })
      }
      return json({
        status: "needs_selection",
        message: "Auswahl erforderlich - noch nicht aktiv.",
        reason: "no_own_session_today",
        availableGroups,
        member,
      }, 200)
    }

    const bypassTimeWindow = Boolean(checkinSettings.disableCheckinTimeWindow || disableNormalWindowForTest)
    if (assignment.reason === "outside_time_window" && !bypassTimeWindow) {
      if (process.env.NODE_ENV !== "production") {
        console.info("[admin-scanner-checkin] result", { memberId, status: "blocked", reason: "outside_time_window" })
      }
      return json({
        status: "blocked",
        message: "Check-in ist außerhalb des Zeitfensters nicht möglich.",
        reason: "outside_time_window",
        member,
      }, 400)
    }

    const requiresWeight = Boolean(member.is_competition_member) || isWeightRequiredGroup(assignment.groupName)
    if (requiresWeight && !(body.weight?.trim() ?? "")) {
      if (process.env.NODE_ENV !== "production") {
        console.info("[admin-scanner-checkin] result", { memberId, status: "needs_weight", reason: "weight_required" })
      }
      return json({
        status: "needs_weight",
        message: "Gewicht erforderlich.",
        reason: "weight_required",
        member,
      }, 200)
    }

    const origin = new URL(request.url).origin
    const forwardedResponse = await fetch(new URL("/api/public/member-checkin", origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: request.headers.get("origin") ?? origin,
        Cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        source: "trainer",
        memberId,
        selectedGroup: body.selectedGroup,
        weight: body.weight,
      }),
    })

    const rawText = await forwardedResponse.text()
    let payload: Record<string, unknown> = {}
    try {
      payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {}
    } catch {
      payload = {}
    }

    if (forwardedResponse.ok && payload.ok === true) {
      const snapshot = await readTodayCheckinSnapshot({
        supabase,
        memberId,
        date: liveDate,
      })
      if (process.env.NODE_ENV !== "production") {
        console.info("[admin-scanner-checkin] result", { memberId, status: "success" })
      }
      return json({
        status: "success",
        message: "Mitglied erfolgreich eingecheckt.",
        checkedInAt: snapshot.checkedInAt,
        groupName: snapshot.groupName || assignment.groupName || undefined,
        member,
      }, 200)
    }

    if (payload.reason === "no_own_session_today") {
      return json({
        status: "needs_selection",
        message: "Auswahl erforderlich - noch nicht aktiv.",
        reason: "no_own_session_today",
        availableGroups,
        member,
      }, 200)
    }

    if (payload.reason === "DUPLICATE") {
      const snapshot = await readTodayCheckinSnapshot({
        supabase,
        memberId,
        date: liveDate,
      })
      if (process.env.NODE_ENV !== "production") {
        console.info("[admin-scanner-checkin] result", { memberId, status: "blocked", reason: "DUPLICATE" })
      }
      return json({
        status: "blocked",
        message: "Heute bereits eingecheckt.",
        reason: "DUPLICATE",
        checkedInAt: snapshot.checkedInAt,
        groupName: snapshot.groupName || assignment.groupName || undefined,
        member,
      }, 400)
    }

    if (payload.reason === "outside_time_window") {
      if (process.env.NODE_ENV !== "production") {
        console.info("[admin-scanner-checkin] result", { memberId, status: "blocked", reason: "outside_time_window" })
      }
      return json({
        status: "blocked",
        message: "Check-in ist außerhalb des Zeitfensters nicht möglich.",
        reason: "outside_time_window",
        member,
      }, 400)
    }

    if (payload.reason === "group_not_allowed") {
      if (process.env.NODE_ENV !== "production") {
        console.info("[admin-scanner-checkin] result", { memberId, status: "blocked", reason: "group_not_allowed" })
      }
      return json({
        status: "blocked",
        message: "Für dieses Mitglied ist aktuell keine eindeutige Einheit verfügbar.",
        reason: "group_not_allowed",
        member,
      }, 400)
    }

    if (payload.reason === "email_not_verified") {
      if (process.env.NODE_ENV !== "production") {
        console.info("[admin-scanner-checkin] result", { memberId, status: "blocked", reason: "email_not_verified" })
      }
      return json({
        status: "blocked",
        message: "E-Mail des Mitglieds ist noch nicht bestätigt.",
        reason: "email_not_verified",
        member,
      }, 400)
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("[admin-scanner-checkin] result", {
        memberId,
        status: "error",
        reason: typeof payload.reason === "string" ? payload.reason : "checkin_failed",
      })
    }
    return json({
      status: "error",
      message: typeof payload.error === "string" ? payload.error : "Check-in fehlgeschlagen.",
      reason: typeof payload.reason === "string" ? payload.reason : "checkin_failed",
      member,
    }, 400)
  } catch (error) {
    console.error("admin member-qr checkin failed", error)
    return json({
      status: "error",
      message: "Interner Fehler.",
      reason: "internal_error",
    }, 500)
  }
}