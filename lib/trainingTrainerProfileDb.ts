import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { reportAppError } from "@/lib/appErrorReporter"

// ─── Typen ────────────────────────────────────────────────────────────────────

export type TrainerProfile = {
  trainer_id: string
  style: string | null
  strengths: string | null
  focus: string | null
  notes: string | null
  updated_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSupabase() {
  return createServerSupabaseServiceClient()
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("training_trainer_profiles")
}

// ─── DB-Funktionen ────────────────────────────────────────────────────────────

export async function getTrainerProfile(trainerId: string): Promise<TrainerProfile | null> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from("training_trainer_profiles")
      .select("*")
      .eq("trainer_id", trainerId)
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error)) return null
      void reportAppError(
        "trainingTrainerProfileDb",
        "getTrainerProfile_failed",
        "low",
        error,
        { details: { trainerId } },
      )
      return null
    }

    return data as TrainerProfile | null
  } catch (err) {
    void reportAppError("trainingTrainerProfileDb", "getTrainerProfile_exception", "low", err)
    return null
  }
}

export async function upsertTrainerProfile(
  trainerId: string,
  data: {
    style?: string | null
    strengths?: string | null
    focus?: string | null
    notes?: string | null
  },
): Promise<TrainerProfile | null> {
  try {
    const supabase = getSupabase()
    const { data: result, error } = await supabase
      .from("training_trainer_profiles")
      .upsert(
        { trainer_id: trainerId, ...data, updated_at: new Date().toISOString() },
        { onConflict: "trainer_id" },
      )
      .select()
      .single()

    if (error) {
      if (isMissingTableError(error)) return null
      void reportAppError(
        "trainingTrainerProfileDb",
        "upsertTrainerProfile_failed",
        "medium",
        error,
        { details: { trainerId } },
      )
      return null
    }

    return result as TrainerProfile
  } catch (err) {
    void reportAppError("trainingTrainerProfileDb", "upsertTrainerProfile_exception", "medium", err)
    return null
  }
}
