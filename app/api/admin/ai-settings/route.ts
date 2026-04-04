import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { readAiSettings, writeAiSettings } from "@/lib/aiSettingsDb"
import { createAiSecurityEventSafe } from "@/lib/aiSecurityEventsDb"
import { SECURITY_EVENT_TYPES } from "@/lib/aiSecurity"

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      void createAiSecurityEventSafe({
        type: SECURITY_EVENT_TYPES.AUTH_DENIED,
        route: "/api/admin/ai-settings",
        ip: getRequestIp(request),
        actor: session?.accountEmail ?? null,
        severity: "high",
        detail: "Unbefugter Zugriffsversuch auf KI-Einstellungen (GET)",
        source: "admin/ai-settings",
      })
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-ai-settings-get:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const settings = await readAiSettings()
    return NextResponse.json(settings)
  } catch (error) {
    console.error("ai-settings GET failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      void createAiSecurityEventSafe({
        type: SECURITY_EVENT_TYPES.AUTH_DENIED,
        route: "/api/admin/ai-settings",
        ip: getRequestIp(request),
        actor: session?.accountEmail ?? null,
        severity: "high",
        detail: "Unbefugter Zugriffsversuch auf KI-Einstellungen (POST)",
        source: "admin/ai-settings",
      })
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-ai-settings-post:${getRequestIp(request)}`, 10, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body: unknown = await request.json()
    if (!body || typeof body !== "object") {
      return new NextResponse("Bad request", { status: 400 })
    }

    const b = body as Record<string, unknown>
    if (
      typeof b.ai_enabled !== "boolean" ||
      typeof b.brute_force_detection_enabled !== "boolean" ||
      typeof b.auto_block_suspicious_ips !== "boolean" ||
      typeof b.admin_alerts_enabled !== "boolean"
    ) {
      return new NextResponse("Invalid payload", { status: 400 })
    }

    const saved = await writeAiSettings({
      ai_enabled: b.ai_enabled,
      brute_force_detection_enabled: b.brute_force_detection_enabled,
      auto_block_suspicious_ips: b.auto_block_suspicious_ips,
      admin_alerts_enabled: b.admin_alerts_enabled,
    })

    return NextResponse.json(saved)
  } catch (error) {
    console.error("ai-settings POST failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
