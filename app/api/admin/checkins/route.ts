import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
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
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = checkRateLimit(`admin-checkins:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const response = await supabase
      .from("checkins")
      .select(`
        id,
        member_id,
        group_name,
        date,
        time,
        created_at,
        members(
          id,
          name,
          first_name,
          last_name,
          birthdate,
          is_trial,
          is_approved,
          base_group
        )
      `)
      .order("created_at", { ascending: false })

    if (response.error) throw response.error

    return NextResponse.json({
      rows: response.data ?? [],
    })
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
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = checkRateLimit(`admin-checkins-delete:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as { checkinId?: string }
    const checkinId = body.checkinId?.trim()
    if (!checkinId) {
      return new NextResponse("Missing checkin id", { status: 400 })
    }

    const supabase = getServerSupabase()
    const { error } = await supabase.from("checkins").delete().eq("id", checkinId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("admin checkin delete failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
