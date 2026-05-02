import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { getTodayCheckins } from "@/lib/boxgymDb"
import { getTodayIsoDateInBerlin } from "@/lib/dateFormat"

const TODAY_CHECKINS_CACHE_CONTROL = "public, max-age=5, s-maxage=10, stale-while-revalidate=10"

type TodayCheckinsBody = {
  date?: string
}

type PublicTodayCheckinRow = Record<string, unknown> & {
  members?: {
    id?: string
    name?: string | null
    first_name?: string | null
    last_name?: string | null
    is_trial?: boolean | null
    is_approved?: boolean | null
    base_group?: string | null
  } | null
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const rateLimit = await checkRateLimitAsync(`public-today-checkins:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as TodayCheckinsBody
    const date = body.date ?? getTodayIsoDateInBerlin()
    const rows = ((await getTodayCheckins(date)) as PublicTodayCheckinRow[]).map((row) => ({
      ...row,
      members: row.members
        ? {
            id: row.members.id,
            name: row.members.name ?? null,
            first_name: row.members.first_name ?? null,
            last_name: row.members.last_name ?? null,
            is_trial: row.members.is_trial ?? null,
            is_approved: row.members.is_approved ?? null,
            base_group: row.members.base_group ?? null,
          }
        : null,
    }))

    return NextResponse.json(
      { rows },
      {
        headers: {
          "Cache-Control": TODAY_CHECKINS_CACHE_CONTROL,
        },
      }
    )
  } catch (error) {
    console.error("public today checkins failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
