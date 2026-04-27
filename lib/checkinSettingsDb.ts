import { createServerSupabaseServiceClient, hasSupabaseServiceRoleKey } from "@/lib/serverSupabase"

const CHECKIN_WINDOW_OVERRIDE_KEY = "disable_checkin_time_window"
const DISABLE_NORMAL_CHECKIN_WINDOW_KEY = "disable_normal_checkin_time_window"

export type CheckinSettings = {
  disableCheckinTimeWindow: boolean
  disableNormalCheckinTimeWindow: boolean
}

function defaultCheckinSettings(): CheckinSettings {
  return {
    disableCheckinTimeWindow: false,
    disableNormalCheckinTimeWindow: false,
  }
}

function isMissingSettingsTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("app_settings")
}

function parseBooleanSetting(value: unknown) {
  if (typeof value === "boolean") return value
  if (value && typeof value === "object" && "enabled" in value) {
    return Boolean((value as { enabled?: unknown }).enabled)
  }
  return false
}

export async function readCheckinSettings() {
  if (!hasSupabaseServiceRoleKey()) {
    return defaultCheckinSettings()
  }

  const supabase = createServerSupabaseServiceClient()
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value_json")
    .in("key", [CHECKIN_WINDOW_OVERRIDE_KEY, DISABLE_NORMAL_CHECKIN_WINDOW_KEY])

  if (error) {
    if (isMissingSettingsTableError(error)) return defaultCheckinSettings()
    throw error
  }

  const settingsByKey = new Map((data ?? []).map((entry) => [entry.key, entry.value_json]))

  return {
    disableCheckinTimeWindow: parseBooleanSetting(settingsByKey.get(CHECKIN_WINDOW_OVERRIDE_KEY)),
    disableNormalCheckinTimeWindow: parseBooleanSetting(settingsByKey.get(DISABLE_NORMAL_CHECKIN_WINDOW_KEY)),
  }
}

export async function writeCheckinSettings(settings: CheckinSettings) {
  const supabase = createServerSupabaseServiceClient()
  const { error } = await supabase.from("app_settings").upsert(
    [
      {
        key: CHECKIN_WINDOW_OVERRIDE_KEY,
        value_json: { enabled: settings.disableCheckinTimeWindow },
        updated_at: new Date().toISOString(),
      },
      {
        key: DISABLE_NORMAL_CHECKIN_WINDOW_KEY,
        value_json: { enabled: settings.disableNormalCheckinTimeWindow },
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "key" }
  )

  if (error) throw error

  return settings
}