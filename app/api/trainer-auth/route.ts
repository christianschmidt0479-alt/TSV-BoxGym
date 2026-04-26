import { NextResponse } from "next/server"
import { clearTrainerSessionCookie } from "@/lib/authSession"

/**
 * Deprecated: login moved to /api/trainer-login.
 *
 * DELETE remains for compatibility with older clients calling
 * /api/trainer-auth to clear trainer session cookie.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Diese Route ist veraltet. Bitte /api/trainer-login verwenden.",
      loginRoute: "/api/trainer-login",
    },
    { status: 410 }
  )
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  return clearTrainerSessionCookie(response)
}
