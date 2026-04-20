import { NextResponse } from "next/server"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { readMemberAreaSessionFromHeaders } from "@/lib/publicAreaSession"

export async function POST(request: Request) {
  try {
    const session = await readMemberAreaSessionFromHeaders(request)
    if (!session) {
      return NextResponse.json({ open: false })
    }
    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("member_deletion_requests")
      .select("id")
      .eq("member_id", session.memberId)
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
