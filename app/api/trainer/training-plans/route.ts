import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getPlansAssignedToTrainer } from "@/lib/trainingPlansDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

// ─── Pilot-Guard ──────────────────────────────────────────────────────────────
// Vorgeschlagene Trainingspläne sind ausschließlich für den Thomas-Pilot freigeschaltet.
// Weitere Trainer werden erst nach Abschluss des Pilots aktiviert.

const PILOT_FIRST_NAME = "Thomas"

function isPilotTrainer(session: { accountFirstName: string }) {
  return session.accountFirstName.trim() === PILOT_FIRST_NAME
}

async function findTrainerIdByEmail(email: string): Promise<string | null> {
  const supabase = createServerSupabaseServiceClient()
  const { data, error } = await supabase
    .from("trainer_accounts")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle()

  if (error || !data) return null
  return (data as { id: string }).id
}

// ─── GET /api/trainer/training-plans ─────────────────────────────────────────
// Gibt die diesem Trainer zugewiesenen Pläne zurück (Pilot-only).

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    if (!isPilotTrainer(session)) {
      return new NextResponse("Not available", { status: 403 })
    }

    const rateLimit = await checkRateLimitAsync(
      `trainer-training-plans:${getRequestIp(request)}`,
      60,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const trainerId = await findTrainerIdByEmail(session.accountEmail)
    if (!trainerId) {
      return NextResponse.json({ plans: [] })
    }

    const plans = await getPlansAssignedToTrainer(trainerId)
    return NextResponse.json({ plans })
  } catch (error) {
    console.error("[trainer training-plans GET]", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
