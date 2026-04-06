import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

// ─── Typen ────────────────────────────────────────────────────────────────────

export type AppErrorSeverity = "low" | "medium" | "high" | "critical"
export type AppErrorStatus = "open" | "acknowledged" | "resolved" | "ignored"

export type AppErrorRecord = {
  id: string
  created_at: string
  updated_at: string
  source: string
  route: string | null
  error_type: string
  severity: AppErrorSeverity
  message: string
  details: string | null
  actor: string | null
  actor_role: string | null
  ip: string | null
  fingerprint: string | null
  status: AppErrorStatus
  note: string | null
  first_seen_at: string
  last_seen_at: string
  occurrence_count: number
}

export type AppErrorInput = {
  source: string
  route?: string | null
  error_type: string
  severity: AppErrorSeverity
  message: string
  details?: string | null
  actor?: string | null
  actor_role?: string | null
  ip?: string | null
}

export type AppErrorSummary = {
  totalOpen: number
  totalCritical: number
  totalToday: number
  lastCriticalAt: string | null
  bySeverity: Record<AppErrorSeverity, number>
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export function isMissingAppErrorsTableError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const message = error.message?.toLowerCase() ?? ""
  return (
    error.code === "PGRST205" ||
    message.includes("app_errors") ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    error.code === "42P01"
  )
}

/**
 * Baut einen stabilen Fingerabdruck für einen Fehler.
 * Gleiche Fehler (gleiche Quelle, Route, Typ, normalisierte Nachricht) erhalten denselben Fingerprint
 * und werden per Upsert zusammengefasst.
 */
export function buildAppErrorFingerprint(input: Pick<AppErrorInput, "source" | "route" | "error_type" | "message">): string {
  const normalized = normalizeMessage(input.message)
  const parts = [
    input.source.toLowerCase().trim(),
    (input.route ?? "").toLowerCase().trim(),
    input.error_type.toLowerCase().trim(),
    normalized,
  ]
  return parts.join("|")
}

function normalizeMessage(message: string): string {
  // Entfernt variable Teile wie UUIDs, IDs, Timestamps
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d{4,}\b/g, "<id>")
    .replace(/\b\d{4}-\d{2}-\d{2}(t\d{2}:\d{2}:\d{2})?/gi, "<date>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
}

/** Sanitiert Details — kürzt auf max. 2000 Zeichen, entfernt keine Secrets explizit (Verantwortung liegt beim Caller) */
export function sanitizeDetails(details: string | null | undefined): string | null {
  if (!details) return null
  return String(details).slice(0, 2000)
}

// ─── Schreibfunktionen ────────────────────────────────────────────────────────

/**
 * Erstellt einen neuen Fehlereintrag. Gibt null zurück wenn die Tabelle fehlt oder ein Fehler auftritt.
 * Wirft NIE in Produktion — Fehler im Fehlermodul dürfen nie den Hauptflow unterbrechen.
 */
export async function createAppErrorSafe(input: AppErrorInput): Promise<AppErrorRecord | null> {
  try {
    const supabase = getServerSupabase()
    const fingerprint = buildAppErrorFingerprint(input)
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from("app_errors")
      .insert([
        {
          source: input.source,
          route: input.route ?? null,
          error_type: input.error_type,
          severity: input.severity,
          message: input.message.slice(0, 500),
          details: sanitizeDetails(input.details),
          actor: input.actor ?? null,
          actor_role: input.actor_role ?? null,
          ip: input.ip ?? null,
          fingerprint,
          status: "open",
          first_seen_at: now,
          last_seen_at: now,
          occurrence_count: 1,
        },
      ])
      .select()
      .single()

    if (error) {
      if (!isMissingAppErrorsTableError(error)) {
        console.warn("[appErrorsDb] createAppErrorSafe failed:", error.message)
      }
      return null
    }

    return data as AppErrorRecord
  } catch {
    return null
  }
}

/**
 * Upsert: Wenn ein offener Eintrag mit gleichem Fingerprint existiert (innerhalb 7 Tage),
 * wird occurrence_count erhöht und last_seen_at aktualisiert.
 * Andernfalls wird ein neuer Eintrag angelegt.
 */
export async function upsertAppErrorSafe(input: AppErrorInput): Promise<AppErrorRecord | null> {
  try {
    const supabase = getServerSupabase()
    const fingerprint = buildAppErrorFingerprint(input)
    const now = new Date().toISOString()
    const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Suche nach existierendem offenem Eintrag
    const { data: existing, error: fetchError } = await supabase
      .from("app_errors")
      .select("id, occurrence_count, status")
      .eq("fingerprint", fingerprint)
      .in("status", ["open", "acknowledged"])
      .gte("last_seen_at", windowStart)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      if (!isMissingAppErrorsTableError(fetchError)) {
        console.warn("[appErrorsDb] upsertAppErrorSafe fetch failed:", fetchError.message)
      }
      return null
    }

    if (existing) {
      // Vorhandenen Eintrag aktualisieren
      const { data: updated, error: updateError } = await supabase
        .from("app_errors")
        .update({
          last_seen_at: now,
          updated_at: now,
          occurrence_count: (existing.occurrence_count ?? 1) + 1,
          details: sanitizeDetails(input.details),
        })
        .eq("id", existing.id)
        .select()
        .single()

      if (updateError) {
        console.warn("[appErrorsDb] upsertAppErrorSafe update failed:", updateError.message)
        return null
      }

      return updated as AppErrorRecord
    }

    // Neuen Eintrag anlegen
    return createAppErrorSafe(input)
  } catch {
    return null
  }
}

// ─── Lesefunktionen ───────────────────────────────────────────────────────────

export type ListAppErrorsOptions = {
  range?: "24h" | "7d" | "30d"
  status?: AppErrorStatus | null
  severity?: AppErrorSeverity | null
  q?: string | null
  limit?: number
}

function rangeToWindowStart(range: "24h" | "7d" | "30d"): string {
  const ms = range === "24h" ? 24 * 60 * 60 * 1000 : range === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
  return new Date(Date.now() - ms).toISOString()
}

export async function listAppErrors(options: ListAppErrorsOptions = {}): Promise<AppErrorRecord[]> {
  try {
    const supabase = getServerSupabase()
    const { range = "7d", status, severity, q, limit = 200 } = options

    let query = supabase
      .from("app_errors")
      .select("*")
      .gte("created_at", rangeToWindowStart(range))
      .order("last_seen_at", { ascending: false })
      .limit(limit)

    if (status) query = query.eq("status", status)
    if (severity) query = query.eq("severity", severity)
    if (q) query = query.or(`source.ilike.%${q}%,route.ilike.%${q}%,error_type.ilike.%${q}%,message.ilike.%${q}%`)

    const { data, error } = await query

    if (error) {
      if (!isMissingAppErrorsTableError(error)) {
        console.warn("[appErrorsDb] listAppErrors failed:", error.message)
      }
      return []
    }

    return (data ?? []) as AppErrorRecord[]
  } catch {
    return []
  }
}

export async function getAppErrorById(id: string): Promise<AppErrorRecord | null> {
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase.from("app_errors").select("*").eq("id", id).single()

    if (error) {
      if (!isMissingAppErrorsTableError(error)) {
        console.warn("[appErrorsDb] getAppErrorById failed:", error.message)
      }
      return null
    }

    return data as AppErrorRecord
  } catch {
    return null
  }
}

export async function updateAppErrorStatus(
  id: string,
  status: AppErrorStatus,
  note?: string | null
): Promise<AppErrorRecord | null> {
  try {
    const supabase = getServerSupabase()
    const now = new Date().toISOString()

    const payload: Record<string, unknown> = { status, updated_at: now }
    if (note !== undefined) payload.note = note?.slice(0, 1000) ?? null

    const { data, error } = await supabase
      .from("app_errors")
      .update(payload)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.warn("[appErrorsDb] updateAppErrorStatus failed:", error.message)
      return null
    }

    return data as AppErrorRecord
  } catch {
    return null
  }
}

export async function getAppErrorOverview(range: "24h" | "7d" | "30d" = "7d"): Promise<AppErrorSummary> {
  const empty: AppErrorSummary = {
    totalOpen: 0,
    totalCritical: 0,
    totalToday: 0,
    lastCriticalAt: null,
    bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
  }

  try {
    const supabase = getServerSupabase()
    const windowStart = rangeToWindowStart(range)
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

    const [allInRange, todayErrors, lastCritical] = await Promise.all([
      supabase.from("app_errors").select("id, severity, status").gte("created_at", windowStart),
      supabase.from("app_errors").select("id").gte("created_at", todayStart),
      supabase
        .from("app_errors")
        .select("last_seen_at")
        .eq("severity", "critical")
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (allInRange.error) {
      if (!isMissingAppErrorsTableError(allInRange.error)) {
        console.warn("[appErrorsDb] getAppErrorOverview failed:", allInRange.error.message)
      }
      return empty
    }

    const rows = allInRange.data ?? []
    const bySeverity: Record<AppErrorSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 }

    for (const row of rows) {
      const sev = row.severity as AppErrorSeverity
      if (sev in bySeverity) bySeverity[sev]++
    }

    return {
      totalOpen: rows.filter((r) => r.status === "open").length,
      totalCritical: bySeverity.critical,
      totalToday: todayErrors.data?.length ?? 0,
      lastCriticalAt: lastCritical.data?.last_seen_at ?? null,
      bySeverity,
    }
  } catch {
    return empty
  }
}
