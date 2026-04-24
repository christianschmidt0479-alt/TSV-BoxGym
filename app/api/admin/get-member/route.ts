import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { verifyTrainerSessionToken } from "@/lib/authSession"

export async function POST(req: Request) {
  const session = (await cookies()).get("trainer_session")

  if (!session) {
    return NextResponse.json({ ok: false, error: "Nicht autorisiert" }, { status: 401 })
  }

  const valid = await verifyTrainerSessionToken(session.value)

  if (!valid || valid.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Keine Berechtigung" }, { status: 403 })
  }

  const { id } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )


  const { data, error } = await supabase
    .from("members")
    .select("id, name, email, birthdate, base_group, is_competition_member")
    .eq("id", id)
    .maybeSingle()

  if (process.env.NODE_ENV !== "production") {
    console.log("GET MEMBER ID:", id)
    console.log("DATA:", data)
    console.log("ERROR:", error)
  }

  if (error) {
    console.error(error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: "Kein Mitglied gefunden" }, { status: 404 })
  }

  return NextResponse.json(data)
}
