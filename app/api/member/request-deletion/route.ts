import { NextResponse } from "next/server"
import { getMemberFromSession } from "@/lib/memberAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

export async function POST() {
  const member = await getMemberFromSession()

  if (!member) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const now = new Date().toISOString()

  const { error } = await supabaseAdmin
    .from("member_deletion_requests")
    .insert({
      member_id: member.id,
      status: "pending",
      requested_at: now,
    })

  if (error) {
    if ((error.code || "") === "23505") {
      return NextResponse.json({ ok: true, alreadyRequested: true })
    }
    return NextResponse.json({ error: "deletion_request_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
