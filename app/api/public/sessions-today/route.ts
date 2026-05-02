import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { sessions } from "@/lib/boxgymSessions"

const SESSIONS_TODAY_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=300"

function getDayKey(date: Date) {
  const day = date.getDay()

  switch (day) {
    case 1:
      return "Montag"
    case 2:
      return "Dienstag"
    case 3:
      return "Mittwoch"
    case 4:
      return "Donnerstag"
    case 5:
      return "Freitag"
    default:
      return ""
  }
}

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const rateLimit = await checkRateLimitAsync(`public-sessions-today:${getRequestIp(request)}`, 30, 5 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }
    const dayKey = getDayKey(new Date())
    const rows = sessions
      .filter((session) => session.dayKey === dayKey)
      .map((session) => ({
        start: session.start,
        end: session.end,
        group: session.group,
        name: session.group,
      }))

    return NextResponse.json(
      { data: rows },
      {
        headers: {
          "Cache-Control": SESSIONS_TODAY_CACHE_CONTROL,
        },
      }
    )
  } catch (error) {
    console.error("public sessions today failed", error)
    return NextResponse.json({ data: [] }, { status: 200 })
  }
}
