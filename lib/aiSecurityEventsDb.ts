import { createServerSupabaseServiceClient, hasSupabaseServiceRoleKey } from "@/lib/serverSupabase"
import type { SecurityEvent } from "@/lib/aiSecurity"

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("ai_security_events")
}

type AiSecurityEventRow = {
  id: string
  created_at: string
  type: string
  route: string | null
  ip: string | null
  actor: string | null
  severity: string
  detail: string | null
  source: string
}

export async function readAiSecurityEvents(limit = 100): Promise<SecurityEvent[]> {
  if (!hasSupabaseServiceRoleKey()) return []

  const supabase = createServerSupabaseServiceClient()
  const { data, error } = await supabase
    .from("ai_security_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }

  return ((data as AiSecurityEventRow[] | null) ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    type: row.type,
    route: row.route ?? null,
    ip: row.ip ?? null,
    actor: row.actor ?? null,
    severity: (row.severity === "high" || row.severity === "medium" ? row.severity : "low") as SecurityEvent["severity"],
    detail: row.detail ?? null,
    source: row.source,
  }))
}

// ─────────────────────────────────────────────
// Write-Helper – defensiv, niemals Request-blockierend
// ─────────────────────────────────────────────

type CreateAiSecurityEventInput = {
  type: string
  route?: string | null
  ip?: string | null
  actor?: string | null
  severity: "low" | "medium" | "high"
  detail?: string | null
  source?: string
}

export async function createAiSecurityEventSafe(input: CreateAiSecurityEventInput): Promise<void> {
  if (!hasSupabaseServiceRoleKey()) return

  try {
    const supabase = createServerSupabaseServiceClient()

    const row = {
      type: String(input.type).slice(0, 64),
      route: input.route ? String(input.route).slice(0, 256) : null,
      ip: input.ip ? String(input.ip).slice(0, 64) : null,
      actor: input.actor ? String(input.actor).slice(0, 256) : null,
      severity: (["low", "medium", "high"] as const).includes(input.severity) ? input.severity : "low",
      detail: input.detail ? String(input.detail).slice(0, 512) : null,
      source: input.source ? String(input.source).slice(0, 128) : "system",
    }

    const { error } = await supabase.from("ai_security_events").insert([row])

    if (error && !isMissingTableError(error)) {
      // Nur warnen, nie werfen – Security-Logging darf Hauptflows nicht brechen
      console.warn("ai_security_events write failed (non-critical):", error.message)
    }
  } catch {
    // Stiller Fallback – Logging-Fehler dürfen niemals Requests abbrechen
  }
}
