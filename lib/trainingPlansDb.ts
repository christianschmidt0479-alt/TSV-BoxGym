import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

export type TrainingPlanStatus = "draft" | "ai_generated" | "reviewed"
export type TemplateQuality = "tested" | "recommended" | "standard"

export type TrainingPlan = {
  id: string
  date: string
  group_key: string
  training_time: string | null
  age_group: string | null
  performance_level: string | null
  participant_count: number | null
  trainer_count: number | null
  duration_minutes: number | null
  training_goal: string | null
  training_focus: string | null
  training_mode: string | null
  sparring_allowed: boolean
  ring_available: boolean
  ai_context: string | null
  plan_type: "single" | "combo" | "followup"
  secondary_group_key: string | null
  is_holiday_combined: boolean
  based_on_plan_id: string | null
  generated_plan: string | null
  status: TrainingPlanStatus
  is_template: boolean
  template_name: string | null
  template_quality: TemplateQuality | null
  created_at: string
  updated_at: string
}

export type TrainingPlanInsert = {
  date: string
  group_key: string
  training_time?: string | null
  age_group?: string | null
  performance_level?: string | null
  participant_count?: number | null
  trainer_count?: number | null
  duration_minutes?: number | null
  training_goal?: string | null
  training_focus?: string | null
  training_mode?: string | null
  sparring_allowed: boolean
  ring_available: boolean
  ai_context?: string | null
  plan_type?: "single" | "combo" | "followup"
  secondary_group_key?: string | null
  is_holiday_combined?: boolean
  based_on_plan_id?: string | null
  status?: TrainingPlanStatus
  template_quality?: TemplateQuality | null
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("training_plans")
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export async function getTrainingPlans(): Promise<TrainingPlan[]> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("training_plans")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }

  return (data ?? []) as TrainingPlan[]
}

export async function createTrainingPlan(plan: TrainingPlanInsert): Promise<TrainingPlan> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("training_plans")
    .insert([{ ...plan, status: plan.status ?? "draft" }])
    .select()
    .single()

  if (error) throw error

  return data as TrainingPlan
}

export async function updateTrainingPlanGenerated(
  id: string,
  generatedPlan: string,
): Promise<TrainingPlan> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("training_plans")
    .update({
      generated_plan: generatedPlan,
      status: "ai_generated",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) throw error

  return data as TrainingPlan
}

export async function updateTrainingPlanEdited(input: {
  id: string
  generated_plan: string
  status: TrainingPlanStatus
  is_template: boolean
  template_name: string | null
  training_focus?: string | null
  training_mode?: string | null
  training_time?: string | null
  plan_type?: "single" | "combo" | "followup"
  secondary_group_key?: string | null
  is_holiday_combined?: boolean
  based_on_plan_id?: string | null
  template_quality?: TemplateQuality | null
}): Promise<TrainingPlan> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("training_plans")
    .update({
      generated_plan: input.generated_plan,
      status: input.status,
      is_template: input.is_template,
      template_name: input.template_name,
      ...(input.training_focus !== undefined && { training_focus: input.training_focus }),
      ...(input.training_mode !== undefined && { training_mode: input.training_mode }),
      ...(input.training_time !== undefined && { training_time: input.training_time }),
      ...(input.plan_type !== undefined && { plan_type: input.plan_type }),
      ...(input.secondary_group_key !== undefined && { secondary_group_key: input.secondary_group_key }),
      ...(input.is_holiday_combined !== undefined && { is_holiday_combined: input.is_holiday_combined }),
      ...(input.based_on_plan_id !== undefined && { based_on_plan_id: input.based_on_plan_id }),
      ...(input.template_quality !== undefined && { template_quality: input.template_quality }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select()
    .single()

  if (error) throw error

  return data as TrainingPlan
}

export async function updateTemplateQuality(
  id: string,
  quality: TemplateQuality | null,
): Promise<TrainingPlan> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("training_plans")
    .update({ template_quality: quality, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) throw error

  return data as TrainingPlan
}
