import { createServerSupabaseServiceClient, hasSupabaseServiceRoleKey } from "@/lib/serverSupabase"

// ─── Typen ────────────────────────────────────────────────────────────────────

export type TrainingAiContext = {
  has_ring: boolean
  ring_often_available: boolean
  heavy_bags_count: number
  mitts_pairs_count: number
  jump_ropes_count: number
  medicine_balls_count: number
  max_group_size: number
  space_description: string
  training_principles: string
  group_characteristics: string
  updated_at: string
}

// ─── Standardwerte ──────────────────────────────────────────────────────────

export function defaultTrainingAiContext(): TrainingAiContext {
  return {
    has_ring: true,
    ring_often_available: true,
    heavy_bags_count: 8,
    mitts_pairs_count: 6,
    jump_ropes_count: 12,
    medicine_balls_count: 4,
    max_group_size: 20,
    space_description: "",
    training_principles: "",
    group_characteristics: "",
    updated_at: new Date().toISOString(),
  }
}

// ─── Fehlerklassifizierung ───────────────────────────────────────────────────

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    error?.code === "PGRST205" ||
    message.includes("training_ai_context") ||
    message.includes("relation") ||
    message.includes("does not exist")
  )
}

// ─── Lesen ────────────────────────────────────────────────────────────────────

export async function getTrainingAiContext(): Promise<TrainingAiContext> {
  if (!hasSupabaseServiceRoleKey()) return defaultTrainingAiContext()
  try {
    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("training_ai_context")
      .select("*")
      .eq("id", 1)
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error)) return defaultTrainingAiContext()
      throw error
    }

    if (!data) return defaultTrainingAiContext()

    return {
      has_ring: typeof data.has_ring === "boolean" ? data.has_ring : true,
      ring_often_available: typeof data.ring_often_available === "boolean" ? data.ring_often_available : true,
      heavy_bags_count: typeof data.heavy_bags_count === "number" ? data.heavy_bags_count : 8,
      mitts_pairs_count: typeof data.mitts_pairs_count === "number" ? data.mitts_pairs_count : 6,
      jump_ropes_count: typeof data.jump_ropes_count === "number" ? data.jump_ropes_count : 12,
      medicine_balls_count: typeof data.medicine_balls_count === "number" ? data.medicine_balls_count : 4,
      max_group_size: typeof data.max_group_size === "number" ? data.max_group_size : 20,
      space_description: typeof data.space_description === "string" ? data.space_description : "",
      training_principles: typeof data.training_principles === "string" ? data.training_principles : "",
      group_characteristics: typeof data.group_characteristics === "string" ? data.group_characteristics : "",
      updated_at: typeof data.updated_at === "string" ? data.updated_at : new Date().toISOString(),
    }
  } catch {
    return defaultTrainingAiContext()
  }
}

// ─── Schreiben ────────────────────────────────────────────────────────────────

export type TrainingAiContextUpdate = Omit<TrainingAiContext, "updated_at">

export async function upsertTrainingAiContext(input: TrainingAiContextUpdate): Promise<TrainingAiContext> {
  const supabase = createServerSupabaseServiceClient()

  const { data, error } = await supabase
    .from("training_ai_context")
    .upsert(
      {
        id: 1,
        has_ring: input.has_ring,
        ring_often_available: input.ring_often_available,
        heavy_bags_count: input.heavy_bags_count,
        mitts_pairs_count: input.mitts_pairs_count,
        jump_ropes_count: input.jump_ropes_count,
        medicine_balls_count: input.medicine_balls_count,
        max_group_size: input.max_group_size,
        space_description: input.space_description,
        training_principles: input.training_principles,
        group_characteristics: input.group_characteristics,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("*")
    .single()

  if (error) throw error
  return {
    has_ring: data.has_ring as boolean,
    ring_often_available: data.ring_often_available as boolean,
    heavy_bags_count: data.heavy_bags_count as number,
    mitts_pairs_count: data.mitts_pairs_count as number,
    jump_ropes_count: data.jump_ropes_count as number,
    medicine_balls_count: data.medicine_balls_count as number,
    max_group_size: data.max_group_size as number,
    space_description: data.space_description as string,
    training_principles: data.training_principles as string,
    group_characteristics: data.group_characteristics as string,
    updated_at: data.updated_at as string,
  }
}
