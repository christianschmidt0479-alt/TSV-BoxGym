import { NextResponse, type NextRequest } from "next/server"
import { readTrainerSessionFromRequest } from "@/lib/authSession"

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = await readTrainerSessionFromRequest(request)

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
  matcher: ["/trainer/:path*", "/verwaltung/:path*"],
}
