import { NextResponse } from "next/server"
import { applyTrainerSessionCookie, clearTrainerSessionCookie, readTrainerSessionFromHeaders, getTrainerSessionMaxAgeMs } from "@/lib/authSession"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { findTrainerByEmail } from "@/lib/trainerDb"
import { findMemberById } from "@/lib/boxgymDb"

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
  const linkedMemberId = trainerAccount.linked_member_id ?? null
  const linkedMember = linkedMemberId ? await findMemberById(linkedMemberId) : null
  const memberId = linkedMember?.id ?? null

  const response = NextResponse.json({
    ok: true,
    role: accountRole,
    accountRole,
    linkedMemberId,
    memberId,
    accountEmail: trainerAccount.email,
    accountFirstName: trainerAccount.first_name,
    accountLastName: trainerAccount.last_name,
    sessionUntil: Date.now() + getTrainerSessionMaxAgeMs(),
  })

  return await applyTrainerSessionCookie(response, {
    userId: trainerAccount.id,
    role: accountRole,
    accountRole,
    linkedMemberId,
    memberId,
    isMember: Boolean(memberId),
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
