import { NextRequest, NextResponse } from "next/server"
import { ratelimit } from "@/lib/ratelimit"
import { applyTrainerSessionCookie, TRAINER_SESSION_COOKIE, verifyTrainerSessionToken } from "@/lib/authSession"

function isMutationMethod(method: string) {
  const upper = method.toUpperCase()
  return upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE"
}

function isCriticalMutationPath(pathname: string) {
  return (
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/checkin/")
  )
}

function isTrainerSessionActivityPath(pathname: string) {
  return (
    pathname === "/trainer" ||
    pathname.startsWith("/trainer/") ||
    pathname === "/verwaltung-neu" ||
    pathname.startsWith("/verwaltung-neu/") ||
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/trainer/")
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!isMutationMethod(request.method) || !isCriticalMutationPath(pathname)) {
    const response = NextResponse.next()

    if (!isTrainerSessionActivityPath(pathname)) {
      return response
    }

    const token = request.cookies.get(TRAINER_SESSION_COOKIE)?.value
    const session = await verifyTrainerSessionToken(token)
    if (!session) {
      return response
    }

    const role = session.role === "admin" ? "admin" : session.role === "trainer" ? "trainer" : null
    const accountRole = session.accountRole === "admin" ? "admin" : session.accountRole === "trainer" ? "trainer" : null

    // Only renew authenticated trainer/admin sessions (no anonymous/member-only extension).
    if (role !== "admin" && role !== "trainer" && accountRole !== "admin" && accountRole !== "trainer") {
      return response
    }

    return await applyTrainerSessionCookie(response, {
      userId: session.userId,
      role,
      accountRole,
      linkedMemberId: session.linkedMemberId,
      memberId: session.memberId ?? null,
      isMember: Boolean(session.isMember),
      accountEmail: session.accountEmail,
      accountFirstName: session.accountFirstName,
      accountLastName: session.accountLastName,
    })
  }

  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"
  const { success } = await ratelimit.limit(`${pathname}:${ip}`)

  if (!success) {
    return new Response(JSON.stringify({ error: "Zu viele Anfragen" }), { status: 429 })
  }

  const response = NextResponse.next()
  const token = request.cookies.get(TRAINER_SESSION_COOKIE)?.value
  const session = await verifyTrainerSessionToken(token)
  if (!session) {
    return response
  }

  const role = session.role === "admin" ? "admin" : session.role === "trainer" ? "trainer" : null
  const accountRole = session.accountRole === "admin" ? "admin" : session.accountRole === "trainer" ? "trainer" : null

  if (role !== "admin" && role !== "trainer" && accountRole !== "admin" && accountRole !== "trainer") {
    return response
  }

  return await applyTrainerSessionCookie(response, {
    userId: session.userId,
    role,
    accountRole,
    linkedMemberId: session.linkedMemberId,
    memberId: session.memberId ?? null,
    isMember: Boolean(session.isMember),
    accountEmail: session.accountEmail,
    accountFirstName: session.accountFirstName,
    accountLastName: session.accountLastName,
  })
}

export const config = {
  matcher: ["/api/:path*", "/trainer", "/trainer/:path*", "/verwaltung-neu", "/verwaltung-neu/:path*"],
}
