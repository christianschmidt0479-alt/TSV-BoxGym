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

    const { id, birthdate, weight, group, isFighter } = body as {
      id?: string
      birthdate?: string | null
      weight?: number | null
      group?: string | null
      isFighter?: boolean
    }

    if (!id) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const updateData: Record<string, unknown> = {
      birthdate,
      base_group: group,
      is_competition_member: isFighter,
    }

    if (isFighter || group === "L-Gruppe") {
      updateData["weight"] = weight
    } else {
      updateData["weight"] = null
    }

    const { error } = await supabase
      .from("members")
      .update(updateData)
      .eq("id", id)

    if (error) {
      console.error("SUPABASE ERROR:", error)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("API ERROR:", error)
    return new Response(JSON.stringify({ error: true, message: "Serverfehler" }), { status: 500 })
  }
}
