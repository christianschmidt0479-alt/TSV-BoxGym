import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { reportAppError } from "@/lib/appErrorReporter"

// ─── Typen ────────────────────────────────────────────────────────────────────

export type TrainerProfile = {
  trainer_id: string
  // Basis-Felder (seit v1)
  style: string | null
  strengths: string | null
  focus: string | null
  notes: string | null
  // Erweiterte KI-Stammdaten (seit v2)
  internal_label: string | null
  trainer_license: string | null
  trainer_experience_level: string | null
  trainer_limitations: string | null
  trainer_group_handling: string | null
  trainer_pedagogy_notes: string | null
  preferred_structure_level: string | null
  admin_internal_notes: string | null
  updated_at: string
}

// Normalisiert einen DB-Rohwert – neue Felder default auf null falls Spalte noch fehlt
function normalizeProfile(raw: unknown): TrainerProfile | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  return {
    trainer_id: (r.trainer_id as string) ?? "",
    style: (r.style as string | null) ?? null,
    strengths: (r.strengths as string | null) ?? null,
    focus: (r.focus as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    internal_label: (r.internal_label as string | null) ?? null,
    trainer_license: (r.trainer_license as string | null) ?? null,
    trainer_experience_level: (r.trainer_experience_level as string | null) ?? null,
    trainer_limitations: (r.trainer_limitations as string | null) ?? null,
    trainer_group_handling: (r.trainer_group_handling as string | null) ?? null,
    trainer_pedagogy_notes: (r.trainer_pedagogy_notes as string | null) ?? null,
    preferred_structure_level: (r.preferred_structure_level as string | null) ?? null,
    admin_internal_notes: (r.admin_internal_notes as string | null) ?? null,
    updated_at: (r.updated_at as string) ?? new Date().toISOString(),
  }
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

    return normalizeProfile(data)
  } catch (err) {
    void reportAppError("trainingTrainerProfileDb", "getTrainerProfile_exception", "low", err)
    return null
  }
}

export type UpsertTrainerProfileData = {
  style?: string | null
  strengths?: string | null
  focus?: string | null
  notes?: string | null
  internal_label?: string | null
  trainer_license?: string | null
  trainer_experience_level?: string | null
  trainer_limitations?: string | null
  trainer_group_handling?: string | null
  trainer_pedagogy_notes?: string | null
  preferred_structure_level?: string | null
  admin_internal_notes?: string | null
}

export async function upsertTrainerProfile(
  trainerId: string,
  data: UpsertTrainerProfileData,
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

    return normalizeProfile(result)
  } catch (err) {
    void reportAppError("trainingTrainerProfileDb", "upsertTrainerProfile_exception", "medium", err)
    return null
  }
}

export async function getAllTrainerProfiles(): Promise<TrainerProfile[]> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from("training_trainer_profiles")
      .select("*")
      .order("updated_at", { ascending: false })

    if (error) {
      if (isMissingTableError(error)) return []
      void reportAppError(
        "trainingTrainerProfileDb",
        "getAllTrainerProfiles_failed",
        "low",
        error,
      )
      return []
    }

    return ((data as unknown[]) ?? []).map(normalizeProfile).filter((p): p is TrainerProfile => p !== null)
  } catch (err) {
    void reportAppError("trainingTrainerProfileDb", "getAllTrainerProfiles_exception", "low", err)
    return []
  }
}
