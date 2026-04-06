import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { updateTrainingPlanEdited, updateTemplateQuality, type TrainingPlanStatus, type TemplateQuality } from "@/lib/trainingPlansDb"

type PatchBody = {
  generated_plan?: unknown
  status?: unknown
  is_template?: unknown
  template_name?: unknown
  training_focus?: unknown
  training_mode?: unknown
  training_time?: unknown
  plan_type?: unknown
  secondary_group_key?: unknown
  is_holiday_combined?: unknown
  based_on_plan_id?: unknown
  template_quality?: unknown
}

const ALLOWED_STATUSES: TrainingPlanStatus[] = ["draft", "ai_generated", "reviewed"]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-training-plans-patch:${getRequestIp(request)}`,
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

    const body = (await request.json()) as PatchBody

    if (typeof body.generated_plan !== "string" || !body.generated_plan.trim()) {
      return new NextResponse("Pflichtfeld fehlt: generated_plan", { status: 400 })
    }

    const status: TrainingPlanStatus = ALLOWED_STATUSES.includes(body.status as TrainingPlanStatus)
      ? (body.status as TrainingPlanStatus)
      : "reviewed"

    const isTemplate = body.is_template === true
    const templateName =
      isTemplate && typeof body.template_name === "string" && body.template_name.trim()
        ? body.template_name.trim()
        : null

    const plan = await updateTrainingPlanEdited({
      id: id.trim(),
      generated_plan: body.generated_plan.trim(),
      status,
      is_template: isTemplate,
      template_name: templateName,
      training_focus: typeof body.training_focus === "string" && body.training_focus.trim() ? body.training_focus.trim() : null,
      training_mode: typeof body.training_mode === "string" && body.training_mode.trim() ? body.training_mode.trim() : null,
      training_time: typeof body.training_time === "string" && body.training_time.trim() ? body.training_time.trim() : undefined,
      ...(body.plan_type === "combo" || body.plan_type === "followup" || body.plan_type === "single"
        ? { plan_type: body.plan_type as "single" | "combo" | "followup" }
        : {}),
      secondary_group_key:
        typeof body.secondary_group_key === "string" && body.secondary_group_key.trim()
          ? body.secondary_group_key.trim()
          : null,
      is_holiday_combined: body.is_holiday_combined === true,
      based_on_plan_id:
        typeof body.based_on_plan_id === "string" && body.based_on_plan_id.trim()
          ? body.based_on_plan_id.trim()
          : null,
      template_quality:
        body.template_quality === "tested" || body.template_quality === "recommended" || body.template_quality === "standard"
          ? (body.template_quality as TemplateQuality)
          : null,
    })

    return NextResponse.json({ plan })
  } catch (error) {
    console.error("admin training-plans PATCH failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
