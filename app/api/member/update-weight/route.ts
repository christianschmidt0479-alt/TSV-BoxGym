import { NextResponse } from "next/server"

import { isAllowedOrigin } from "@/lib/apiSecurity"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { createMemberWeightLog, findMemberById } from "@/lib/boxgymDb"
import { needsWeight } from "@/lib/memberUtils"

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

    if (!memberId || !Number.isFinite(weight) || weight < 20 || weight > 300) {
      return NextResponse.json({ ok: false, error: "Ungültige Eingaben" }, { status: 400 })
    }

    // Nur Mitglieder, die Gewicht pflegen müssen (Wettkämpfer / L-Gruppe)
    const member = await findMemberById(memberId)
    if (!member || !needsWeight(member)) {
      return new NextResponse("Forbidden", { status: 403 })
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

    if (!todayCheckin?.id) {
      return NextResponse.json({ ok: false, error: "Kein Check-in gefunden" }, { status: 404 })
    }

    const { error: updateError } = await supabase
      .from("checkins")
      .update({ weight: String(weight) })
      .eq("id", todayCheckin.id)

    if (updateError) throw updateError

    await createMemberWeightLog({
      memberId,
      weightKg: weight,
      source: "checkin",
      checkinId: todayCheckin.id,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("member update-weight failed", error)
    }
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
