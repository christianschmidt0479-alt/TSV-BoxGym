import { NextResponse, type NextRequest } from "next/server"
import { readTrainerSessionFromRequest, TRAINER_SESSION_COOKIE } from "@/lib/authSession"

const ADMIN_ONLY_PREFIXES = [
  "/verwaltung/einstellungen",
  "/verwaltung/freigaben",
  "/verwaltung/inbox",
  "/verwaltung/mail",
  "/verwaltung/mitglieder",
  "/verwaltung/personen",
  "/verwaltung/trainer",
  "/verwaltung/wettkampf",
]

function isAdminOnlyPath(pathname: string) {
  return ADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function logProxyBlock(context: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return
  console.warn("[proxy] blocked request", context)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = await readTrainerSessionFromRequest(request)

  if (pathname.startsWith("/api/admin")) {
    if (!session || session.accountRole !== "admin") {
      logProxyBlock({
        pathname,
        reason: !session ? "missing_session" : "missing_admin_role",
        hasCookie: Boolean(request.cookies.get(TRAINER_SESSION_COOKIE)?.value),
        role: session?.role ?? null,
        accountRole: session?.accountRole ?? null,
        host: request.headers.get("host") || "",
        referer: request.headers.get("referer") || "",
      })
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.next()
  }

  if (pathname.startsWith("/trainer")) {
    if (!session) {
      return NextResponse.redirect(new URL("/trainer-zugang", request.url))
    }
    return NextResponse.next()
  }

  if (pathname.startsWith("/verwaltung")) {
    if (!session) {
      return NextResponse.redirect(new URL("/trainer-zugang", request.url))
    }

    if (isAdminOnlyPath(pathname) && session.accountRole !== "admin") {
      return NextResponse.redirect(new URL("/verwaltung", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/admin/:path*", "/trainer/:path*", "/verwaltung/:path*"],
}
