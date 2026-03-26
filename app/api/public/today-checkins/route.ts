import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { getTodayCheckins } from "@/lib/boxgymDb"

type TodayCheckinsBody = {
  date?: string
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const rateLimit = checkRateLimit(`public-today-checkins:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as TodayCheckinsBody
    const date = body.date ?? new Date().toISOString().slice(0, 10)
    const rows = await getTodayCheckins(date)

    return NextResponse.json({ rows })
  } catch (error) {
    console.error("public today checkins failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
