import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

type BoxzwergeCheckinBody = {
  member_id?: string
  group_name?: string
  weight?: string
  date?: string
  time?: string
  year?: number
  month_key?: string
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

const BOXZWERGE_GROUP = "Boxzwerge" // legacy, wird soft-disabled
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/

async function requireTrainerSession(request: Request) {
  if (!isAllowedOrigin(request)) {
    return { error: new NextResponse("Forbidden", { status: 403 }), session: null }
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session) {
    return { error: new NextResponse("Unauthorized", { status: 401 }), session: null }
  }

  return { error: null, session }
}

function isValidCheckinDate(value: string) {
  return DATE_PATTERN.test(value)
}

function isValidMonthKey(value: string) {
  return MONTH_KEY_PATTERN.test(value)
}

function isValidTime(value: string) {
  return TIME_PATTERN.test(value)
}

export async function POST(request: Request) {
  try {
    const { error: authError } = await requireTrainerSession(request)
    if (authError) return authError

    const rateLimit = await checkRateLimitAsync(`boxzwerge-create:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as BoxzwergeCheckinBody
    const memberId = body.member_id?.trim()
    const groupName = body.group_name?.trim()
    const date = body.date?.trim()
    const time = body.time?.trim()
    const year = Number(body.year)
    const monthKey = body.month_key?.trim()
    const normalizedGroup = normalizeTrainingGroup(groupName)
    const numericWeight =
      body.weight && body.weight.trim() !== ""
        ? Number(body.weight.replace(",", "."))
        : null

    if (
      !memberId ||
      !groupName ||
      false ||
      !date ||
      !isValidCheckinDate(date) ||
      !time ||
      !isValidTime(time) ||
      !monthKey ||
      !isValidMonthKey(monthKey) ||
      !Number.isInteger(year) ||
      year !== Number(date.slice(0, 4)) ||
      monthKey !== date.slice(0, 7)
    ) {
      return new NextResponse("Invalid checkin payload", { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("id", memberId)
      .eq("base_group", BOXZWERGE_GROUP)
      .maybeSingle()

    if (memberError) throw memberError
    if (!member) {
      return new NextResponse("Member not found", { status: 404 })
    }

    const { data: existingCheckin, error: existingCheckinError } = await supabase
      .from("checkins")
      .select("id")
      .eq("member_id", memberId)
      .eq("group_name", BOXZWERGE_GROUP)
      .eq("date", date)
      .maybeSingle()

    if (existingCheckinError) throw existingCheckinError
    if (existingCheckin) {
      return new NextResponse("Checkin already exists", { status: 409 })
    }

    const { error } = await supabase
      .from("checkins")
      .insert([
        {
          member_id: memberId,
          group_name: BOXZWERGE_GROUP,
          weight: Number.isNaN(numericWeight) ? null : numericWeight,
          date,
          time,
          year,
          month_key: monthKey,
        },
      ])

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("boxzwerge-checkin create failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { error: authError } = await requireTrainerSession(request)
    if (authError) return authError

    const rateLimit = await checkRateLimitAsync(`boxzwerge-delete:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const url = new URL(request.url)
    const checkinId = url.searchParams.get("id")?.trim()
    if (!checkinId) {
      return new NextResponse("Missing checkin id", { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data: checkin, error: checkinError } = await supabase
      .from("checkins")
      .select("id, group_name")
      .eq("id", checkinId)
      .maybeSingle()

    if (checkinError) throw checkinError
    if (!checkin) {
      return new NextResponse("Checkin not found", { status: 404 })
    }

    const { error } = await supabase.from("checkins").delete().eq("id", checkinId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("boxzwerge-checkin delete failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
