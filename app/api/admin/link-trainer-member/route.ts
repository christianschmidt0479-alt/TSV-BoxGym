import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyTrainerSessionToken } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

export async function POST(request: Request) {
  try {
    const session = (await cookies()).get("trainer_session")

    if (!session) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 })
    }

    const valid = await verifyTrainerSessionToken(session.value)

    if (!valid || valid.role !== "admin") {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 })
    }

    let body: unknown = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 })
    }

    const { trainerId, memberId } = body as { trainerId?: string; memberId?: string }

    if (!trainerId || !memberId) {
      return NextResponse.json({ error: "trainerId und memberId sind erforderlich" }, { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()

    const { data: existing, error: existingError } = await supabase
      .from("trainer_accounts")
      .select("id")
      .eq("linked_member_id", memberId)
      .maybeSingle()

    if (existingError) {
      console.error("SUPABASE ERROR:", existingError)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }

    if (existing) {
      return NextResponse.json(
        { error: "Dieses Mitglied ist bereits einem Trainer zugeordnet" },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from("trainer_accounts")
      .update({ linked_member_id: memberId })
      .eq("id", trainerId)

    if (error) {
      console.error("SUPABASE ERROR:", error)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error("API ERROR:", error)
    return new Response(JSON.stringify({ error: true, message: "Serverfehler" }), { status: 500 })
  }
}
