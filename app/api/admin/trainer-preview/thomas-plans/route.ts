import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getPlansAssignedToTrainer } from "@/lib/trainingPlansDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { reportAppError } from "@/lib/appErrorReporter"

// ─── GET /api/admin/trainer-preview/thomas-plans ──────────────────────────────
// Admin-only: gibt die Thomas zugewiesenen Pläne zurück, ohne Trainer-Session zu erzeugen.
// Ermöglicht eine rein lesende Admin-Vorschau der Traineransicht.

const PILOT_FIRST_NAME = "Thomas"

async function findThomasTrainerId(): Promise<string | null> {
  const supabase = createServerSupabaseServiceClient()
  const { data, error } = await supabase
    .from("trainer_accounts")
    .select("id, first_name")
    .ilike("first_name", PILOT_FIRST_NAME)
    .maybeSingle()

  if (error || !data) return null
  return (data as { id: string }).id
}

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
      `admin-trainer-preview:${getRequestIp(request)}`,
      30,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const thomasId = await findThomasTrainerId()
    if (!thomasId) {
      return NextResponse.json({ plans: [], trainerFound: false })
    }

    const plans = await getPlansAssignedToTrainer(thomasId)
    return NextResponse.json({ plans, trainerFound: true })
  } catch (error) {
    void reportAppError(
      "admin-trainer-preview",
      "load_failed",
      "medium",
      error,
      { route: "/api/admin/trainer-preview/thomas-plans" },
    )
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
