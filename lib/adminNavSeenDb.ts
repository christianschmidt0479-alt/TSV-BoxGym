import { createServerSupabaseServiceClient, hasSupabaseServiceRoleKey } from "@/lib/serverSupabase"

const SEEN_STATE_KEY = "admin_nav_seen_state"

// ─── Typen ────────────────────────────────────────────────────────────────────

export type AdminNavSeenSection = "mailbox" | "errors" | "security" | "approvals"

export type AdminNavSeenState = {
  mailbox: string | null
  errors: string | null
  security: string | null
  approvals: string | null
}

function defaultSeenState(): AdminNavSeenState {
  return { mailbox: null, errors: null, security: null, approvals: null }
}

// ─── Lesen ────────────────────────────────────────────────────────────────────

export async function readAdminNavSeenState(): Promise<AdminNavSeenState> {
  if (!hasSupabaseServiceRoleKey()) return defaultSeenState()
  try {
    const supabase = createServerSupabaseServiceClient()
    const { data } = await supabase
      .from("app_settings")
      .select("value_json")
      .eq("key", SEEN_STATE_KEY)
      .maybeSingle()
    if (!data?.value_json) return defaultSeenState()
    const v = data.value_json as Partial<AdminNavSeenState>
    return {
      mailbox: typeof v.mailbox === "string" ? v.mailbox : null,
      errors: typeof v.errors === "string" ? v.errors : null,
      security: typeof v.security === "string" ? v.security : null,
      approvals: typeof v.approvals === "string" ? v.approvals : null,
    }
  } catch {
    return defaultSeenState()
  }
}

// ─── Schreiben ────────────────────────────────────────────────────────────────

export async function writeAdminNavSeenSection(section: AdminNavSeenSection): Promise<void> {
  if (!hasSupabaseServiceRoleKey()) return
  try {
    const supabase = createServerSupabaseServiceClient()
    const current = await readAdminNavSeenState()
    const updated: AdminNavSeenState = {
      ...current,
      [section]: new Date().toISOString(),
    }
    await supabase
      .from("app_settings")
      .upsert({ key: SEEN_STATE_KEY, value_json: updated }, { onConflict: "key" })
  } catch {
    // defensiv: Fehler beim Schreiben des Seen-States dürfen nichts kaputtmachen
  }
}
