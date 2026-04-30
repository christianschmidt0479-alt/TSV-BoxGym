import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { getBerlinDayRangeUtc, getTodayIsoDateInBerlin, isTodayCheckinInBerlin } from "@/lib/dateFormat"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || (session.accountRole !== "admin" && session.accountRole !== "trainer")) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-checkins:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const scope = new URL(request.url).searchParams.get("scope")
    const todayOnly = scope === "today"
    const todayIsoDate = getTodayIsoDateInBerlin()
    const { startIso, endIso } = getBerlinDayRangeUtc()

    const supabase = getServerSupabase()
    let query = supabase
      .from("checkins")
      .select(`
        id,
        member_id,
        group_name,
        checkin_mode,
        weight,
        date,
        time,
        created_at,
        members(
          name,
          first_name,
          last_name,
          is_trial
        )
      `)

    if (todayOnly) {
      query = query.or(`date.eq.${todayIsoDate},and(created_at.gte.${startIso},created_at.lte.${endIso})`)
    }

    const response = await query
      .order("created_at", { ascending: false })
      .limit(todayOnly ? 200 : 100)

    if (response.error) throw response.error

    const todayRows = (response.data ?? []).filter((row) => isTodayCheckinInBerlin(row, todayIsoDate))

    if (process.env.NODE_ENV !== "production") {
      console.info("[admin/checkins] rows", {
        dbRows: response.data?.length ?? 0,
        todayOnly,
        todayRows: todayRows.length,
      })
    }

    return NextResponse.json({
      rows: response.data ?? [],
      todayRows,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("admin checkins failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || (session.accountRole !== "admin" && session.accountRole !== "trainer")) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const body = (await request.json()) as { checkinId?: string }
    const checkinId = body.checkinId?.trim()
    if (!checkinId) {
      return new NextResponse("Missing checkin id", { status: 400 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-checkins-delete:${getRequestIp(request)}:${checkinId}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const { data: checkin, error: checkinError } = await supabase
      .from("checkins")
      .select("id, member_id, date, group_name")
      .eq("id", checkinId)
      .maybeSingle()

    if (checkinError) throw checkinError
    if (!checkin) {
      return new NextResponse("Checkin not found", { status: 404 })
    }

    const { error } = await supabase.from("checkins").delete().eq("id", checkinId)
    if (error) throw error

    await writeAdminAuditLog({
      session,
      action: "checkin_deleted",
      targetType: "checkin",
      targetId: checkin.id,
      targetName: checkin.member_id,
      details: `Datum: ${checkin.date}, Gruppe: ${checkin.group_name}`,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("admin checkin delete failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
