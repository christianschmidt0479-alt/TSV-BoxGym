import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export async function DELETE(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = checkRateLimit(`boxzwerge-delete:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const url = new URL(request.url)
    const checkinId = url.searchParams.get("id")?.trim()
    if (!checkinId) {
      return new NextResponse("Missing checkin id", { status: 400 })
    }

    const supabase = getServerSupabase()
    const { error } = await supabase.from("checkins").delete().eq("id", checkinId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("boxzwerge-checkin delete failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
