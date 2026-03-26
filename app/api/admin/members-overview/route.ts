import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = checkRateLimit(`admin-members-overview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const [membersResponse, checkinsResponse, parentLinksResponse] = await Promise.all([
      supabase.from("members").select("*").order("last_name", { ascending: true }).order("first_name", { ascending: true }),
      supabase.from("checkins").select("member_id, created_at, date").order("created_at", { ascending: false }),
      supabase.from("parent_child_links").select(`
        member_id,
        parent_account_id,
        parent_accounts (
          id,
          parent_name,
          email,
          phone
        )
      `),
    ])

    if (membersResponse.error) throw membersResponse.error
    if (checkinsResponse.error) throw checkinsResponse.error
    if (parentLinksResponse.error) throw parentLinksResponse.error

    const parentLinks = ((parentLinksResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      parent_accounts: Array.isArray(row.parent_accounts)
        ? row.parent_accounts[0] ?? null
        : row.parent_accounts ?? null,
    }))

    return NextResponse.json({
      members: membersResponse.data ?? [],
      checkinRows: checkinsResponse.data ?? [],
      parentLinks,
    })
  } catch (error) {
    console.error("admin members overview failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
