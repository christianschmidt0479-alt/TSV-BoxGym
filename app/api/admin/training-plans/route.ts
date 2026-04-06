import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createTrainingPlan, getTrainingPlans, type TrainingPlanInsert } from "@/lib/trainingPlansDb"

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-training-plans-read:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const plans = await getTrainingPlans()
    return NextResponse.json({ plans })
  } catch (error) {
    console.error("admin training-plans GET failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

type TrainingPlanBody = {
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
  based_on_plan_id?: unknown
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

    const rateLimit = await checkRateLimitAsync(`admin-training-plans-write:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as TrainingPlanBody

    if (typeof body.date !== "string" || !body.date.trim()) {
      return new NextResponse("Pflichtfeld fehlt: date", { status: 400 })
    }
    if (typeof body.group_key !== "string" || !body.group_key.trim()) {
      return new NextResponse("Pflichtfeld fehlt: group_key", { status: 400 })
    }

    const insert: TrainingPlanInsert = {
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
      training_goal: typeof body.training_goal === "string" && body.training_goal.trim() ? body.training_goal.trim() : null,
      training_focus: typeof body.training_focus === "string" && body.training_focus.trim() ? body.training_focus.trim() : null,
      training_mode: typeof body.training_mode === "string" && body.training_mode.trim() ? body.training_mode.trim() : null,
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
      based_on_plan_id:
        typeof body.based_on_plan_id === "string" && body.based_on_plan_id.trim()
          ? body.based_on_plan_id.trim()
          : null,
      status: "draft",
    }

    const plan = await createTrainingPlan(insert)
    return NextResponse.json({ plan }, { status: 201 })
  } catch (error) {
    console.error("admin training-plans POST failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
