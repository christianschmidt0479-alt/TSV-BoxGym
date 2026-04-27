import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { readCheckinSettings, writeCheckinSettings } from "@/lib/checkinSettingsDb"

type CheckinSettingsBody = {
  disableCheckinTimeWindow?: boolean
  disableNormalCheckinTimeWindow?: boolean
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

    const rateLimit = await checkRateLimitAsync(`admin-checkin-settings:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const settings = await readCheckinSettings()
    return NextResponse.json(settings)
  } catch (error) {
    console.error("admin checkin settings read failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-checkin-settings-write:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as CheckinSettingsBody
    if (
      typeof body.disableCheckinTimeWindow !== "boolean" ||
      typeof body.disableNormalCheckinTimeWindow !== "boolean"
    ) {
      return new NextResponse("Invalid settings payload", { status: 400 })
    }

    const previousSettings = await readCheckinSettings()
    const nextSettings = await writeCheckinSettings({
      disableCheckinTimeWindow: body.disableCheckinTimeWindow,
      disableNormalCheckinTimeWindow: body.disableNormalCheckinTimeWindow,
    })

    await writeAdminAuditLog({
      session,
      action: "checkin_window_override_changed",
      targetType: "setting",
      targetId: "checkin_settings",
      targetName: "Check-in-Einstellungen",
      details:
        `Ferienmodus vorher: ${previousSettings.disableCheckinTimeWindow ? "deaktiviert" : "aktiv"}, ` +
        `Ferienmodus neu: ${nextSettings.disableCheckinTimeWindow ? "deaktiviert" : "aktiv"}; ` +
        `Normalmodus-Zeitfenster vorher deaktiviert: ${previousSettings.disableNormalCheckinTimeWindow ? "ja" : "nein"}, ` +
        `neu deaktiviert: ${nextSettings.disableNormalCheckinTimeWindow ? "ja" : "nein"}`,
    })

    return NextResponse.json(nextSettings)
  } catch (error) {
    console.error("admin checkin settings update failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
