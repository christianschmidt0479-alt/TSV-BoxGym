import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { updateTrainerPlanNotes } from "@/lib/trainingPlansDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { reportAppError } from "@/lib/appErrorReporter"

const PILOT_FIRST_NAME = "Thomas"
const TRAINER_NOTES_MAX_LENGTH = 2000

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

type NotesBody = {
  trainer_notes?: unknown
  trainer_modified_plan?: unknown
}

// ─── PATCH /api/trainer/training-plans/[id]/notes ────────────────────────────
// Speichert Trainer-Notizen / eine leicht angepasste Planversion.
// Schreibt NUR in trainer_notes / trainer_modified_plan.
// Das Admin-Original (generated_plan) bleibt unberührt.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      `trainer-plan-notes:${getRequestIp(request)}`,
      30,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const { id } = await params
    if (!id?.trim()) {
      return new NextResponse("Fehlende Plan-ID", { status: 400 })
    }

    const trainerId = await findTrainerIdByEmail(session.accountEmail)
    if (!trainerId) {
      return new NextResponse("Trainer-Konto nicht gefunden", { status: 403 })
    }

    const body = (await request.json()) as NotesBody

    const trainerNotes =
      typeof body.trainer_notes === "string"
        ? body.trainer_notes.trim().slice(0, TRAINER_NOTES_MAX_LENGTH) || null
        : body.trainer_notes === null
          ? null
          : undefined

    if (trainerNotes === undefined) {
      return new NextResponse("trainer_notes muss ein String oder null sein", { status: 400 })
    }

    // trainer_modified_plan: optionaler JSON-String (Trainer-angepasste Planversion)
    const trainerModifiedPlan =
      typeof body.trainer_modified_plan === "string" && body.trainer_modified_plan.trim()
        ? body.trainer_modified_plan.trim()
        : body.trainer_modified_plan === null
          ? null
          : null // bei undefined: nichts ändern → bleibt null-safe

    const plan = await updateTrainerPlanNotes({
      planId: id.trim(),
      trainerId,
      trainerNotes,
      trainerModifiedPlan,
    })

    return NextResponse.json({ plan })
  } catch (error) {
    console.error("[trainer training-plans notes PATCH]", error)
    void reportAppError(
      "trainer-training-plans-notes",
      "notes_save_failed",
      "medium",
      error,
      { route: "/api/trainer/training-plans/[id]/notes" },
    )
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
