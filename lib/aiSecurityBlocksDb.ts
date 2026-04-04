// DB-Layer für manuelle Admin-Sicherheitssperren
// Tabelle: ai_security_blocks (additiv, kein Eingriff in bestehende Tabellen)

import { createServerSupabaseServiceClient, hasSupabaseServiceRoleKey } from "@/lib/serverSupabase"

// ─────────────────────────────────────────────
// Typen
// ─────────────────────────────────────────────

export type SecurityBlockTargetType = "ip" | "route"

export const BLOCK_DURATIONS = ["15m", "1h", "24h", "permanent"] as const
export type BlockDuration = (typeof BLOCK_DURATIONS)[number]

export const BLOCK_REASONS = [
  "Brute-Force-Verdacht",
  "Wiederholte Auth-Fehler",
  "Verdächtige Requests",
  "Manuelle Sicherheitsmaßnahme",
] as const
export type BlockReason = (typeof BLOCK_REASONS)[number] | string

export type AiSecurityBlock = {
  id: string
  created_at: string
  updated_at: string
  target_type: SecurityBlockTargetType
  target_key: string
  block_reason: string
  created_by: string | null
  is_active: boolean
  expires_at: string | null
  note: string | null
}

export type BlockState = {
  blocked: boolean
  blockedUntil: string | null  // ISO string oder null wenn permanent
  blockReason: string | null
  blockId: string | null
}

// ─────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("ai_security_blocks")
}

export function isValidBlockDuration(v: unknown): v is BlockDuration {
  return typeof v === "string" && (BLOCK_DURATIONS as readonly string[]).includes(v)
}

export function isValidTargetType(v: unknown): v is SecurityBlockTargetType {
  return v === "ip" || v === "route"
}

export function blockDurationToExpiresAt(duration: BlockDuration): string | null {
  if (duration === "permanent") return null
  const now = Date.now()
  if (duration === "15m") return new Date(now + 15 * 60 * 1000).toISOString()
  if (duration === "1h") return new Date(now + 60 * 60 * 1000).toISOString()
  if (duration === "24h") return new Date(now + 24 * 60 * 60 * 1000).toISOString()
  return null
}

function isBlockExpired(block: AiSecurityBlock): boolean {
  if (!block.expires_at) return false
  return new Date(block.expires_at).getTime() < Date.now()
}

function emptyBlockState(): BlockState {
  return { blocked: false, blockedUntil: null, blockReason: null, blockId: null }
}

function normalizeRow(row: unknown): AiSecurityBlock {
  const r = row as Record<string, unknown>
  return {
    id: String(r.id ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    target_type: (r.target_type === "ip" || r.target_type === "route" ? r.target_type : "ip") as SecurityBlockTargetType,
    target_key: String(r.target_key ?? ""),
    block_reason: String(r.block_reason ?? ""),
    created_by: r.created_by ? String(r.created_by) : null,
    is_active: Boolean(r.is_active),
    expires_at: r.expires_at ? String(r.expires_at) : null,
    note: r.note ? String(r.note) : null,
  }
}

// ─────────────────────────────────────────────
// Lesen: alle aktiven Blocks
// ─────────────────────────────────────────────

export async function listAiSecurityBlocks(includeExpired = false): Promise<AiSecurityBlock[]> {
  if (!hasSupabaseServiceRoleKey()) return []
  try {
    const supabase = createServerSupabaseServiceClient()
    let query = supabase
      .from("ai_security_blocks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    if (!includeExpired) {
      query = query.eq("is_active", true)
    }

    const { data, error } = await query
    if (error) {
      if (isMissingTableError(error)) return []
      console.error("listAiSecurityBlocks error:", error.message)
      return []
    }

    return ((data as unknown[]) ?? [])
      .map(normalizeRow)
      .filter((b) => !isBlockExpired(b))
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────
// Lesen: aktive Sperre für ein einzelnes Ziel
// ─────────────────────────────────────────────

export async function getActiveAiSecurityBlock(targetKey: string): Promise<AiSecurityBlock | null> {
  if (!hasSupabaseServiceRoleKey()) return null
  try {
    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("ai_security_blocks")
      .select("*")
      .eq("target_key", targetKey)
      .eq("is_active", true)
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error)) return null
      return null
    }
    if (!data) return null
    const block = normalizeRow(data)
    if (isBlockExpired(block)) {
      // Abgelaufene Blocks sauber deaktivieren (fire-and-forget)
      void deactivateAiSecurityBlock(block.id)
      return null
    }
    return block
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────
// Lesen: Block-States für eine Liste von Targets
// ─────────────────────────────────────────────

export async function getBlockStatesForTargets(keys: string[]): Promise<Map<string, BlockState>> {
  const result = new Map<string, BlockState>()
  if (!hasSupabaseServiceRoleKey() || keys.length === 0) return result
  try {
    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("ai_security_blocks")
      .select("id, target_key, block_reason, expires_at, is_active")
      .in("target_key", keys.slice(0, 50))
      .eq("is_active", true)

    if (error) {
      if (isMissingTableError(error)) return result
      return result
    }

    for (const row of (data ?? []) as Array<{ id: string; target_key: string; block_reason: string; expires_at: string | null; is_active: boolean }>) {
      // Abgelaufene überspringen
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) continue
      result.set(row.target_key, {
        blocked: true,
        blockedUntil: row.expires_at,
        blockReason: row.block_reason,
        blockId: row.id,
      })
    }
  } catch {
    // defensiv
  }
  return result
}

// ─────────────────────────────────────────────
// Schreiben: neue Sperre anlegen
// ─────────────────────────────────────────────

export async function createAiSecurityBlock(input: {
  target_type: SecurityBlockTargetType
  target_key: string
  duration: BlockDuration
  block_reason: string
  created_by?: string | null
  note?: string | null
}): Promise<AiSecurityBlock | null> {
  if (!hasSupabaseServiceRoleKey()) return null
  try {
    const supabase = createServerSupabaseServiceClient()

    // Bestehenden aktiven Block für dieses Ziel zuerst deaktivieren
    await supabase
      .from("ai_security_blocks")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("target_key", input.target_key)
      .eq("is_active", true)

    const row = {
      target_type: input.target_type,
      target_key: String(input.target_key).slice(0, 256),
      block_reason: String(input.block_reason).slice(0, 512),
      created_by: input.created_by ? String(input.created_by).slice(0, 256) : null,
      is_active: true,
      expires_at: blockDurationToExpiresAt(input.duration),
      note: input.note ? String(input.note).slice(0, 1024) : null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from("ai_security_blocks")
      .insert([row])
      .select()
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error)) return null
      console.error("createAiSecurityBlock error:", error.message)
      return null
    }
    return data ? normalizeRow(data) : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────
// Schreiben: Sperre deaktivieren (Freigabe)
// ─────────────────────────────────────────────

export async function deactivateAiSecurityBlock(blockId: string): Promise<boolean> {
  if (!hasSupabaseServiceRoleKey()) return false
  try {
    const supabase = createServerSupabaseServiceClient()
    const { error } = await supabase
      .from("ai_security_blocks")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", blockId)

    return !error
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────
// Cleanup: abgelaufene Blocks deaktivieren (leichtgewichtig)
// ─────────────────────────────────────────────

export async function cleanupExpiredAiSecurityBlocks(): Promise<void> {
  if (!hasSupabaseServiceRoleKey()) return
  try {
    const supabase = createServerSupabaseServiceClient()
    await supabase
      .from("ai_security_blocks")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("is_active", true)
      .lt("expires_at", new Date().toISOString())
  } catch {
    // defensiv – kein Absturz
  }
}
