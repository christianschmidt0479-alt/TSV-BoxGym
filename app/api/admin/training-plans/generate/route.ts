import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { generateTrainingPlan, type TrainingPlanInput, type TrainerProfileForAi } from "@/lib/trainingPlanAi"
import { updateTrainingPlanGenerated } from "@/lib/trainingPlansDb"
import { getTrainingAiContext } from "@/lib/trainingAiContextDb"
import { reportAppError } from "@/lib/appErrorReporter"
import { getTrainerProfile } from "@/lib/trainingTrainerProfileDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type GenerateBody = {
  plan_id?: unknown
  date?: unknown
  group_key?: unknown
  training_time?: unknown
  age_group?: unknown
  performance_level?: unknown
  participant_count?: unknown
  trainer_count?: unknown
  duration_minutes?: unknown
  training_goal?: unknown
  training_focus?: unknown
  training_mode?: unknown
  sparring_allowed?: unknown
  ring_available?: unknown
  ai_context?: unknown
  plan_type?: unknown
  secondary_group_key?: unknown
  is_holiday_combined?: unknown
  based_on_plan_title?: unknown
  based_on_plan_summary?: unknown
  template_name?: unknown
  template_plan_type?: unknown
  template_title?: unknown
  template_summary?: unknown
  template_training_goal?: unknown
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-training-plans-generate:${getRequestIp(request)}`,
      10,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as GenerateBody

    if (typeof body.date !== "string" || !body.date.trim()) {
      return new NextResponse("Pflichtfeld fehlt: date", { status: 400 })
    }
    if (typeof body.group_key !== "string" || !body.group_key.trim()) {
      return new NextResponse("Pflichtfeld fehlt: group_key", { status: 400 })
    }

    const input: TrainingPlanInput = {
      date: body.date.trim(),
      group_key: body.group_key.trim(),
      training_time: typeof body.training_time === "string" && body.training_time.trim() ? body.training_time.trim() : null,
      age_group: typeof body.age_group === "string" && body.age_group.trim() ? body.age_group.trim() : null,
      performance_level:
        typeof body.performance_level === "string" && body.performance_level.trim()
          ? body.performance_level.trim()
          : null,
      participant_count:
        typeof body.participant_count === "number" && Number.isFinite(body.participant_count)
          ? Math.max(0, Math.round(body.participant_count))
          : null,
      trainer_count:
        typeof body.trainer_count === "number" && Number.isFinite(body.trainer_count)
          ? Math.max(0, Math.round(body.trainer_count))
          : null,
      duration_minutes:
        typeof body.duration_minutes === "number" && Number.isFinite(body.duration_minutes)
          ? Math.max(1, Math.round(body.duration_minutes))
          : null,
      training_goal:
        typeof body.training_goal === "string" && body.training_goal.trim() ? body.training_goal.trim() : null,
      training_focus:
        typeof body.training_focus === "string" && body.training_focus.trim() ? body.training_focus.trim() : null,
      training_mode:
        typeof body.training_mode === "string" && body.training_mode.trim() ? body.training_mode.trim() : null,
      sparring_allowed: body.sparring_allowed === true,
      ring_available: body.ring_available === true,
      ai_context: typeof body.ai_context === "string" && body.ai_context.trim() ? body.ai_context.trim() : null,
      plan_type:
        body.plan_type === "combo" || body.plan_type === "followup" ? body.plan_type : "single",
      secondary_group_key:
        typeof body.secondary_group_key === "string" && body.secondary_group_key.trim()
          ? body.secondary_group_key.trim()
          : null,
      is_holiday_combined: body.is_holiday_combined === true,
      based_on_plan_title:
        typeof body.based_on_plan_title === "string" && body.based_on_plan_title.trim()
          ? body.based_on_plan_title.trim()
          : null,
      based_on_plan_summary:
        typeof body.based_on_plan_summary === "string" && body.based_on_plan_summary.trim()
          ? body.based_on_plan_summary.trim()
          : null,
      template_name:
        typeof body.template_name === "string" && body.template_name.trim() ? body.template_name.trim() : null,
      template_plan_type:
        body.template_plan_type === "combo" || body.template_plan_type === "followup"
          ? body.template_plan_type
          : body.template_plan_type === "single"
            ? "single"
            : null,
      template_title:
        typeof body.template_title === "string" && body.template_title.trim() ? body.template_title.trim() : null,
      template_summary:
        typeof body.template_summary === "string" && body.template_summary.trim() ? body.template_summary.trim() : null,
      template_training_goal:
        typeof body.template_training_goal === "string" && body.template_training_goal.trim()
          ? body.template_training_goal.trim()
          : null,
    }

    // plan_id früh ermitteln – wird für Trainer-Profil-Lookup und DB-Update gebraucht
    const planId = typeof body.plan_id === "string" && body.plan_id.trim() ? body.plan_id.trim() : null

    // Trainer-Profil für KI laden (graceful – kein Crash bei fehlender Spalte oder Tabelle)
    let trainerProfileForAi: TrainerProfileForAi | null = null
    if (planId) {
      try {
        const supabase = createServerSupabaseServiceClient()
        const { data: planRow, error: planErr } = await supabase
          .from("training_plans")
          .select("assigned_trainer_id")
          .eq("id", planId)
          .maybeSingle()
        if (!planErr && planRow) {
          const assignedId = (planRow as { assigned_trainer_id?: string | null }).assigned_trainer_id ?? null
          if (assignedId) {
            const rawProfile = await getTrainerProfile(assignedId)
            if (rawProfile) {
              trainerProfileForAi = {
                style: rawProfile.style,
                strengths: rawProfile.strengths,
                focus: rawProfile.focus,
                notes: rawProfile.notes,
              }
            }
          }
        }
      } catch {
        // Graceful fallback – kein Profil ist OK
      }
    }

    const result = await generateTrainingPlan(input, await getTrainingAiContext(), trainerProfileForAi)

    // Fehlgeschlagene KI-Generierung loggen (Fallback-Plan wurde genutzt)
    if (result.usedFallback && result.error) {
      void reportAppError(
        "admin-training-plans-generate",
        "ki_generation_failed",
        "medium",
        result.error,
        { route: "/api/admin/training-plans/generate", actor: session.accountEmail },
      )
    }

    // Wenn eine plan_id übergeben wurde, Entwurf in der Datenbank aktualisieren
    let updatedPlan = null
    if (planId) {
      try {
        updatedPlan = await updateTrainingPlanGenerated(planId, JSON.stringify(result.plan))
      } catch {
        // nicht kritisch – Plan trotzdem zurückgeben
      }
    }

    return NextResponse.json({
      plan: result.plan,
      usedFallback: result.usedFallback,
      error: result.error ?? null,
      updatedPlan,
    })
  } catch (error) {
    console.error("admin training-plans generate failed", error)
    void reportAppError(
      "admin-training-plans-generate",
      "generate_route_error",
      "high",
      error,
      { route: "/api/admin/training-plans/generate" },
    )
    return new NextResponse("Internal server error", { status: 500 })
  }
}
