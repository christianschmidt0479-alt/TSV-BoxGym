import { NextResponse } from "next/server"

import { isAllowedOrigin } from "@/lib/apiSecurity"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type UpdateWeightBody = {
  memberId?: string
  weight?: number
}

function berlinDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  return formatter.format(date)
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  try {
    const body = (await request.json()) as UpdateWeightBody
    const memberId = body.memberId?.trim()
    const weight = Number(body.weight)

    if (!memberId || !Number.isFinite(weight) || weight <= 0) {
      return NextResponse.json({ ok: false, error: "Ungültige Eingaben" }, { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()
    const today = berlinDateString()

    const { data: todayCheckin, error: todayFindError } = await supabase
      .from("checkins")
      .select("id")
      .eq("member_id", memberId)
      .eq("date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (todayFindError) throw todayFindError

    let checkinId = todayCheckin?.id ?? null

    if (!checkinId) {
      const { data: latestCheckin, error: latestFindError } = await supabase
        .from("checkins")
        .select("id")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestFindError) throw latestFindError
      checkinId = latestCheckin?.id ?? null
    }

    if (!checkinId) {
      return NextResponse.json({ ok: false, error: "Kein Check-in gefunden" }, { status: 404 })
    }

    const { error: updateError } = await supabase
      .from("checkins")
      .update({ weight: String(weight) })
      .eq("id", checkinId)

    if (updateError) throw updateError

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("member update-weight failed", error)
    }
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
