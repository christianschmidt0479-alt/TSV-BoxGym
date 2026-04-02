import { createServerSupabaseServiceClient, hasSupabaseServiceRoleKey } from "@/lib/serverSupabase"

const CHECKIN_WINDOW_OVERRIDE_KEY = "disable_checkin_time_window"

export type CheckinSettings = {
  disableCheckinTimeWindow: boolean
}

function defaultCheckinSettings(): CheckinSettings {
  return {
    disableCheckinTimeWindow: false,
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
    .eq("key", CHECKIN_WINDOW_OVERRIDE_KEY)
    .maybeSingle()

  if (error) {
    if (isMissingSettingsTableError(error)) return defaultCheckinSettings()
    throw error
  }

  return {
    disableCheckinTimeWindow: parseBooleanSetting(data?.value_json),
  }
}

export async function writeCheckinWindowOverride(disableCheckinTimeWindow: boolean) {
  const supabase = createServerSupabaseServiceClient()
  const { error } = await supabase.from("app_settings").upsert(
    [
      {
        key: CHECKIN_WINDOW_OVERRIDE_KEY,
        value_json: { enabled: disableCheckinTimeWindow },
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "key" }
  )

  if (error) throw error

  return {
    disableCheckinTimeWindow,
  }
}