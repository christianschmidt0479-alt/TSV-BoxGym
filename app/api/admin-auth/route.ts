import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"

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

    const rateLimit = await checkRateLimitAsync(`admin-auth:${getRequestIp(request)}`, 10, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as { password?: string }
    const expected = getAdminLoginPassword()

    if (!expected) {
      return NextResponse.json({ ok: false, configured: false }, { status: 503 })
    }

    const supplied = body.password?.trim() || ""
    if (!supplied) {
      return new NextResponse("Missing password", { status: 400 })
    }

    const ok = safeCompare(supplied, expected)
    return NextResponse.json({ ok, configured: true })
  } catch (error) {
    console.error("admin-auth failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
