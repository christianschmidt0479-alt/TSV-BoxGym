import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"

const CHECKIN_SETTINGS_CACHE_CONTROL = "public, max-age=30, s-maxage=60, stale-while-revalidate=60"

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const rateLimit = await checkRateLimitAsync(`checkin-settings:${getRequestIp(request)}`, 60, 5 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const settings = await readCheckinSettings()
    return NextResponse.json(settings, {
      headers: {
        "Cache-Control": CHECKIN_SETTINGS_CACHE_CONTROL,
      },
    })
  } catch (error) {
    console.error("public checkin settings failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
