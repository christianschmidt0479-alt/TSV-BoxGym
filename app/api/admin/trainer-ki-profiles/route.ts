import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getAllTrainerAccounts } from "@/lib/trainerDb"
import { getAllTrainerProfiles } from "@/lib/trainingTrainerProfileDb"
import { reportAppError } from "@/lib/appErrorReporter"

// ─── GET /api/admin/trainer-ki-profiles ───────────────────────────────────────
// Admin-only: gibt alle Trainer-Accounts mit zugehörigen KI-Stammdaten zurück.
// Wird von der neuen Admin-Übersichtsseite (trainer-ki-profile) genutzt.

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-trainer-ki-profiles:${getRequestIp(request)}`,
      30,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const [accounts, profiles] = await Promise.all([
      getAllTrainerAccounts(),
      getAllTrainerProfiles(),
    ])

    const profileMap = new Map(profiles.map((p) => [p.trainer_id, p]))

    const trainers = accounts.map((acc) => ({
      id: acc.id,
      first_name: acc.first_name,
      last_name: acc.last_name,
      email: acc.email,
      role: acc.role ?? "trainer",
      is_approved: acc.is_approved,
      profile: profileMap.get(acc.id) ?? null,
    }))

    return NextResponse.json({ trainers })
  } catch (error) {
    void reportAppError(
      "admin-trainer-ki-profiles",
      "load_failed",
      "medium",
      error,
      { route: "/api/admin/trainer-ki-profiles" },
    )
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
