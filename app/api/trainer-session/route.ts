import { NextResponse } from "next/server"
import { applyTrainerSessionCookie, clearTrainerSessionCookie, readTrainerSessionFromHeaders, getTrainerSessionMaxAgeMs } from "@/lib/authSession"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { findTrainerByEmail } from "@/lib/trainerDb"

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const rateLimit = await checkRateLimitAsync(`trainer-session-refresh:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
  if (!rateLimit.ok) {
    return new NextResponse("Too many requests", { status: 429 })
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const trainerAccount = await findTrainerByEmail(session.accountEmail)
  if (!trainerAccount || !trainerAccount.email_verified || !trainerAccount.is_approved) {
    const response = new NextResponse("Unauthorized", { status: 401 })
    return clearTrainerSessionCookie(response)
  }

  const accountRole = trainerAccount.role === "admin" ? "admin" : "trainer"

  const response = NextResponse.json({
    ok: true,
    role: accountRole,
    accountRole,
    linkedMemberId: trainerAccount.linked_member_id ?? null,
    accountEmail: trainerAccount.email,
    accountFirstName: trainerAccount.first_name,
    accountLastName: trainerAccount.last_name,
    sessionUntil: Date.now() + getTrainerSessionMaxAgeMs(),
  })

  return await applyTrainerSessionCookie(response, {
    role: accountRole,
    accountRole,
    linkedMemberId: trainerAccount.linked_member_id ?? null,
    accountEmail: trainerAccount.email,
    accountFirstName: trainerAccount.first_name,
    accountLastName: trainerAccount.last_name,
  })
}

export async function DELETE(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  return clearTrainerSessionCookie(response)
}
