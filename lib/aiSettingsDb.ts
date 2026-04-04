import { createServerSupabaseServiceClient, hasSupabaseServiceRoleKey } from "@/lib/serverSupabase"

const AI_SETTINGS_KEY = "ai_settings"

export type AiSettings = {
  ai_enabled: boolean
  brute_force_detection_enabled: boolean
  auto_block_suspicious_ips: boolean
  admin_alerts_enabled: boolean
  updated_at: string | null
}

function defaultAiSettings(): AiSettings {
  return {
    ai_enabled: false,
    brute_force_detection_enabled: false,
    auto_block_suspicious_ips: false,
    admin_alerts_enabled: false,
    updated_at: null,
  }
}

function isMissingSettingsTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("app_settings")
}

export async function readAiSettings(): Promise<AiSettings> {
  if (!hasSupabaseServiceRoleKey()) {
    return defaultAiSettings()
  }

  const supabase = createServerSupabaseServiceClient()
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value_json, updated_at")
    .eq("key", AI_SETTINGS_KEY)
    .maybeSingle()

  if (error) {
    if (isMissingSettingsTableError(error)) return defaultAiSettings()
    throw error
  }

  if (!data) return defaultAiSettings()

  const v = data.value_json as Partial<AiSettings> | null
  return {
    ai_enabled: Boolean(v?.ai_enabled),
    brute_force_detection_enabled: Boolean(v?.brute_force_detection_enabled),
    auto_block_suspicious_ips: Boolean(v?.auto_block_suspicious_ips),
    admin_alerts_enabled: Boolean(v?.admin_alerts_enabled),
    updated_at: (data as { updated_at?: string | null }).updated_at ?? null,
  }
}

export async function writeAiSettings(settings: Omit<AiSettings, "updated_at">): Promise<AiSettings> {
  const supabase = createServerSupabaseServiceClient()
  const now = new Date().toISOString()

  const { error } = await supabase.from("app_settings").upsert(
    [
      {
        key: AI_SETTINGS_KEY,
        value_json: {
          ai_enabled: settings.ai_enabled,
          brute_force_detection_enabled: settings.brute_force_detection_enabled,
          auto_block_suspicious_ips: settings.auto_block_suspicious_ips,
          admin_alerts_enabled: settings.admin_alerts_enabled,
        },
        updated_at: now,
      },
    ],
    { onConflict: "key" }
  )

  if (error) throw error

  return { ...settings, updated_at: now }
}
