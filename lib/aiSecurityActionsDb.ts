// DB-Layer für manuelle Admin-Sicherheitsaktionen
// Tabelle: ai_security_actions (additive, kein Eingriff in bestehende Tabellen)

import { createServerSupabaseServiceClient, hasSupabaseServiceRoleKey } from "@/lib/serverSupabase"

// ─────────────────────────────────────────────
// Typen
// ─────────────────────────────────────────────

export type SecurityActionType = "acknowledged" | "muted" | "watchlist"
export type SecurityActionTargetType = "alert" | "event" | "ip" | "route"

export type AiSecurityAction = {
  id: string
  created_at: string
  updated_at: string
  target_type: SecurityActionTargetType
  target_key: string
  action_type: SecurityActionType
  note: string | null
  created_by: string | null
  is_active: boolean
}

export type ActionState = {
  acknowledged: boolean
  muted: boolean
  watchlisted: boolean
  hasNote: boolean
  notePreview: string | null
}

export type CreateAiSecurityActionInput = {
  target_type: SecurityActionTargetType
  target_key: string
  action_type: SecurityActionType
  note?: string | null
  created_by?: string | null
}

// ─────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("ai_security_actions")
}

const VALID_ACTION_TYPES: SecurityActionType[] = ["acknowledged", "muted", "watchlist"]
const VALID_TARGET_TYPES: SecurityActionTargetType[] = ["alert", "event", "ip", "route"]

export function isValidActionType(v: unknown): v is SecurityActionType {
  return typeof v === "string" && VALID_ACTION_TYPES.includes(v as SecurityActionType)
}

export function isValidTargetType(v: unknown): v is SecurityActionTargetType {
  return typeof v === "string" && VALID_TARGET_TYPES.includes(v as SecurityActionTargetType)
}

// ─────────────────────────────────────────────
// Lesen: alle aktiven Aktionen
// ─────────────────────────────────────────────

export async function listAiSecurityActions(limit = 100): Promise<AiSecurityAction[]> {
  if (!hasSupabaseServiceRoleKey()) return []

  try {
    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("ai_security_actions")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      if (isMissingTableError(error)) return []
      console.error("listAiSecurityActions error:", error.message)
      return []
    }

    return ((data as AiSecurityAction[] | null) ?? []).map(normalizeRow)
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────
// Lesen: Action-States für eine Liste von Targets (für Anreicherung)
// ─────────────────────────────────────────────

export async function getActionStatesForTargets(
  keys: string[]
): Promise<Map<string, ActionState>> {
  const result = new Map<string, ActionState>()
  if (!hasSupabaseServiceRoleKey() || keys.length === 0) return result

  try {
    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("ai_security_actions")
      .select("target_key, action_type, note, is_active")
      .in("target_key", keys.slice(0, 50))
      .eq("is_active", true)

    if (error) {
      if (isMissingTableError(error)) return result
      return result
    }

    for (const row of (data ?? []) as Array<{ target_key: string; action_type: string; note: string | null; is_active: boolean }>) {
      const existing = result.get(row.target_key) ?? emptyActionState()
      if (row.action_type === "acknowledged") existing.acknowledged = true
      if (row.action_type === "muted") existing.muted = true
      if (row.action_type === "watchlist") existing.watchlisted = true
      if (row.note) {
        existing.hasNote = true
        existing.notePreview = row.note.slice(0, 80)
      }
      result.set(row.target_key, existing)
    }
  } catch {
    // defensiv
  }

  return result
}

// ─────────────────────────────────────────────
// Schreiben: Aktion anlegen oder Update (upsert)
// ─────────────────────────────────────────────

export async function upsertAiSecurityAction(input: CreateAiSecurityActionInput): Promise<AiSecurityAction | null> {
  if (!hasSupabaseServiceRoleKey()) return null

  try {
    const supabase = createServerSupabaseServiceClient()

    const row = {
      target_type: input.target_type,
      target_key: String(input.target_key).slice(0, 256),
      action_type: input.action_type,
      note: input.note ? String(input.note).slice(0, 1024) : null,
      created_by: input.created_by ? String(input.created_by).slice(0, 256) : null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    // Upsert: gleiche target_key + action_type → Update
    const { data, error } = await supabase
      .from("ai_security_actions")
      .upsert(row, { onConflict: "target_key,action_type" })
      .select()
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error)) return null
      // Fallback: plain insert wenn unique-Constraint fehlt
      const { data: insertData, error: insertError } = await supabase
        .from("ai_security_actions")
        .insert([row])
        .select()
        .maybeSingle()
      if (insertError) return null
      return insertData ? normalizeRow(insertData as AiSecurityAction) : null
    }

    return data ? normalizeRow(data as AiSecurityAction) : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────
// Schreiben: Aktion deaktivieren (weiches Löschen)
// ─────────────────────────────────────────────

export async function deactivateAiSecurityAction(
  targetKey: string,
  actionType: SecurityActionType
): Promise<void> {
  if (!hasSupabaseServiceRoleKey()) return

  try {
    const supabase = createServerSupabaseServiceClient()
    await supabase
      .from("ai_security_actions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("target_key", targetKey)
      .eq("action_type", actionType)
  } catch {
    // defensiv
  }
}

// ─────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────

function emptyActionState(): ActionState {
  return {
    acknowledged: false,
    muted: false,
    watchlisted: false,
    hasNote: false,
    notePreview: null,
  }
}

function normalizeRow(row: AiSecurityAction): AiSecurityAction {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    target_type: (VALID_TARGET_TYPES.includes(row.target_type as SecurityActionTargetType)
      ? row.target_type
      : "alert") as SecurityActionTargetType,
    target_key: row.target_key,
    action_type: (VALID_ACTION_TYPES.includes(row.action_type as SecurityActionType)
      ? row.action_type
      : "acknowledged") as SecurityActionType,
    note: row.note ?? null,
    created_by: row.created_by ?? null,
    is_active: Boolean(row.is_active),
  }
}
