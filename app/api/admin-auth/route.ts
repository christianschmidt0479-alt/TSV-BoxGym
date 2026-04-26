import { NextResponse } from "next/server"

/**
 * Deprecated: standalone admin login removed.
 *
 * Unified access now uses /api/trainer-login with role-based authorization.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Separater Admin-Login ist deaktiviert. Bitte /trainer-zugang nutzen.",
      loginRoute: "/api/trainer-login",
    },
    { status: 410 }
  )
}
