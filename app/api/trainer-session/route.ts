import { NextResponse } from "next/server"
import { applyTrainerSessionCookie, clearTrainerSessionCookie, readTrainerSessionFromHeaders, getTrainerSessionMaxAgeMs } from "@/lib/authSession"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const rateLimit = checkRateLimit(`trainer-session-refresh:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
  if (!rateLimit.ok) {
    return new NextResponse("Too many requests", { status: 429 })
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const response = NextResponse.json({
    ok: true,
    role: session.role,
    accountRole: session.accountRole,
    linkedMemberId: session.linkedMemberId,
    accountEmail: session.accountEmail,
    accountFirstName: session.accountFirstName,
    accountLastName: session.accountLastName,
    sessionUntil: Date.now() + getTrainerSessionMaxAgeMs(),
  })

  return await applyTrainerSessionCookie(response, {
    role: session.role,
    accountRole: session.accountRole,
    linkedMemberId: session.linkedMemberId,
    accountEmail: session.accountEmail,
    accountFirstName: session.accountFirstName,
    accountLastName: session.accountLastName,
  })
}

export async function DELETE(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  return clearTrainerSessionCookie(response)
}
