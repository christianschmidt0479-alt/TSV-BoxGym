import { NextResponse } from "next/server"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"

export async function POST(request: Request) {
  try {
    const trainerSession = await readTrainerSessionFromHeaders(request)
    const memberId = trainerSession?.memberId ?? trainerSession?.linkedMemberId ?? null
    if (!memberId) {
      return NextResponse.json({ open: false })
    }
    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("member_deletion_requests")
      .select("id")
      .eq("member_id", memberId)
      .eq("status", "pending")
      .maybeSingle()
    if (error || !data) {
      return NextResponse.json({ open: false })
    }
    return NextResponse.json({ open: true })
  } catch {
    return NextResponse.json({ open: false })
  }
}
