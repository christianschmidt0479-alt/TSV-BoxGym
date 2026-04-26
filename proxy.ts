import { NextRequest, NextResponse } from "next/server"
import { ratelimit } from "@/lib/ratelimit"

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!isMutationMethod(request.method) || !isCriticalMutationPath(pathname)) {
    return NextResponse.next()
  }

  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"
  const { success } = await ratelimit.limit(`${pathname}:${ip}`)

  if (!success) {
    return new Response(JSON.stringify({ error: "Zu viele Anfragen" }), { status: 429 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*"],
}
