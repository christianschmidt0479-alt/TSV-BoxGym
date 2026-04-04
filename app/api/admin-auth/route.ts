import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import {
  checkRateLimitAsync,
  delayFailedLogin,
  getLoginLockStateAsync,
  getRequestIp,
  isAllowedOrigin,
  registerLoginFailureAsync,
  sanitizeTextInput,
  clearLoginFailuresAsync,
} from "@/lib/apiSecurity"
import { createAiSecurityEventSafe } from "@/lib/aiSecurityEventsDb"
import { SECURITY_EVENT_TYPES } from "@/lib/aiSecurity"
import { getActiveAiSecurityBlock } from "@/lib/aiSecurityBlocksDb"

function getAdminLoginPassword() {
  return process.env.ADMIN_LOGIN_PASSWORD?.trim() || ""
}

function safeCompare(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)

  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const requestIp = getRequestIp(request)

    // Manuelle IP-Sperre prüfen (defensiv – kein Absturz bei DB-Ausfall)
    if (requestIp) {
      const ipBlock = await getActiveAiSecurityBlock(requestIp)
      if (ipBlock) {
        void createAiSecurityEventSafe({
          type: SECURITY_EVENT_TYPES.MANUAL_BLOCK_HIT,
          route: "/api/admin-auth",
          ip: requestIp,
          severity: "high",
          detail: "Aktive manuelle IP-Sperre",
          source: "admin-auth",
        })
        const msg = ipBlock.expires_at
          ? "Zugriff vorübergehend gesperrt. Bitte später erneut versuchen."
          : "Zugriff gesperrt."
        return new NextResponse(msg, { status: 403 })
      }
    }

    const rateLimit = await checkRateLimitAsync(`admin-auth:${requestIp}`, 5, 15 * 60 * 1000)
    if (!rateLimit.ok) {
      void createAiSecurityEventSafe({
        type: SECURITY_EVENT_TYPES.RATE_LIMIT,
        route: "/api/admin-auth",
        ip: requestIp,
        severity: "medium",
        detail: "Admin-Auth Rate-Limit überschritten",
        source: "admin-auth",
      })
      return new NextResponse("Too many requests", { status: 429 })
    }

    const loginKey = `admin-auth:${requestIp}`
    const lockState = await getLoginLockStateAsync(loginKey, 10)
    if (lockState.blocked) {
      await delayFailedLogin()
      void createAiSecurityEventSafe({
        type: SECURITY_EVENT_TYPES.LOGIN_LOCK,
        route: "/api/admin-auth",
        ip: requestIp,
        severity: "high",
        detail: "Admin-Login gesperrt nach zu vielen Fehlversuchen",
        source: "admin-auth",
      })
      const minutes = Math.max(1, Math.ceil((lockState.retryAfterMs ?? 0) / 60000))
      return new NextResponse(`Zu viele Fehlversuche. Bitte ${minutes} Minuten warten.`, { status: 429 })
    }

    const body = (await request.json()) as { password?: string }
    const expected = getAdminLoginPassword()

    if (!expected) {
      return NextResponse.json({ ok: false, configured: false }, { status: 503 })
    }

    const supplied = sanitizeTextInput(body.password, { maxLength: 256 })
    if (!supplied) {
      return new NextResponse("Missing password", { status: 400 })
    }

    const ok = safeCompare(supplied, expected)
    if (!ok) {
      await registerLoginFailureAsync(loginKey, 10, 15 * 60 * 1000, 15 * 60 * 1000)
      await delayFailedLogin()
      void createAiSecurityEventSafe({
        type: SECURITY_EVENT_TYPES.LOGIN_FAILURE,
        route: "/api/admin-auth",
        ip: requestIp,
        severity: "high",
        detail: "Fehlgeschlagener Admin-Login",
        source: "admin-auth",
      })
      return NextResponse.json({ ok: false, configured: true }, { status: 401 })
    }

    await clearLoginFailuresAsync(loginKey)
    return NextResponse.json({ ok, configured: true })
  } catch (error) {
    console.error("admin-auth failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
