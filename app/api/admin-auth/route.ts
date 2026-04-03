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
    const rateLimit = await checkRateLimitAsync(`admin-auth:${requestIp}`, 5, 15 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const loginKey = `admin-auth:${requestIp}`
    const lockState = await getLoginLockStateAsync(loginKey, 10)
    if (lockState.blocked) {
      await delayFailedLogin()
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
      return NextResponse.json({ ok: false, configured: true }, { status: 401 })
    }

    await clearLoginFailuresAsync(loginKey)
    return NextResponse.json({ ok, configured: true })
  } catch (error) {
    console.error("admin-auth failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
