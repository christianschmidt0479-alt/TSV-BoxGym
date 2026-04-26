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

    const { trainerId } = body as { trainerId?: string }

    if (!trainerId) {
      return NextResponse.json({ error: "trainerId ist erforderlich" }, { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()

    const { error } = await supabase
      .from("trainer_accounts")
      .update({ linked_member_id: null })
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
