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

  const body = await req.json()
  console.log("DELETE BODY:", body)

  const { memberId } = body
  console.log("DELETE memberId:", memberId)

  if (!memberId) {
    console.log("❌ MISSING MEMBER ID")
    return NextResponse.json({ error: "missing_member_id" }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabase
    .from("members")
    .delete()
    .eq("id", memberId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
