import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { verifyTrainerSessionToken } from "@/lib/authSession"

export async function POST(req: Request) {
  try {
    const session = (await cookies()).get("trainer_session")

    if (!session) {
      return NextResponse.json({ ok: false, error: "Nicht autorisiert" }, { status: 401 })
    }

    const valid = await verifyTrainerSessionToken(session.value)

    if (!valid || valid.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Keine Berechtigung" }, { status: 403 })
    }

    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 })
    }

    const { id } = body as { id?: string }
    if (!id) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from("members")
      .select("id, name, email, birthdate, base_group, is_competition_member, email_verified, email_verified_at")
      .eq("id", id)
      .maybeSingle()

    if (error) {
      console.error("SUPABASE ERROR:", error)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: "Kein Mitglied gefunden" }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("API ERROR:", error)
    return new Response(JSON.stringify({ error: true, message: "Serverfehler" }), { status: 500 })
  }
}
