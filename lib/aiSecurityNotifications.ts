// Benachrichtigungsvorbereitung und -versand für KI-Sicherheitswarnungen

import type { SecurityAlert, AiSecurityAnalysis, AiSecuritySettings } from "@/lib/aiSecurity"
import { sendCustomEmail } from "@/lib/resendClient"
import { getAdminNotificationAddress, getAppBaseUrl } from "@/lib/mailConfig"
import { createServerSupabaseServiceClient, hasSupabaseServiceRoleKey } from "@/lib/serverSupabase"

// ─────────────────────────────────────────────
// Typen
// ─────────────────────────────────────────────

export type AdminNotificationPayload = {
  subject: string
  body: string
  summary: string
}

export type AiNotificationState = {
  last_sent_at: string | null
  last_fingerprint: string | null
  last_subject: string | null
}

// ─────────────────────────────────────────────
// Notification State – persistiert in app_settings
// ─────────────────────────────────────────────

const NOTIFICATION_STATE_KEY = "ai_notification_state"
const COOLDOWN_MS = 30 * 60 * 1000 // 30 Minuten

function defaultNotificationState(): AiNotificationState {
  return { last_sent_at: null, last_fingerprint: null, last_subject: null }
}

export async function readNotificationState(): Promise<AiNotificationState> {
  if (!hasSupabaseServiceRoleKey()) return defaultNotificationState()
  try {
    const supabase = createServerSupabaseServiceClient()
    const { data } = await supabase
      .from("app_settings")
      .select("value_json")
      .eq("key", NOTIFICATION_STATE_KEY)
      .maybeSingle()
    if (!data?.value_json) return defaultNotificationState()
    const v = data.value_json as Partial<AiNotificationState>
    return {
      last_sent_at: typeof v.last_sent_at === "string" ? v.last_sent_at : null,
      last_fingerprint: typeof v.last_fingerprint === "string" ? v.last_fingerprint : null,
      last_subject: typeof v.last_subject === "string" ? v.last_subject : null,
    }
  } catch {
    return defaultNotificationState()
  }
}

async function writeNotificationStateSafe(state: AiNotificationState): Promise<void> {
  if (!hasSupabaseServiceRoleKey()) return
  try {
    const supabase = createServerSupabaseServiceClient()
    await supabase
      .from("app_settings")
      .upsert({ key: NOTIFICATION_STATE_KEY, value_json: state }, { onConflict: "key" })
  } catch {
    // defensiv: falls Schreiben fehlschlägt, kein Absturz
  }
}

// ─────────────────────────────────────────────
// Alert-Fingerprint – stabiler Identifikator für Cooldown
// ─────────────────────────────────────────────

export function buildAlertFingerprint(alerts: SecurityAlert[]): string {
  const parts = alerts
    .filter((a) => a.isActive && a.level === "critical")
    .map((a) =>
      [a.level, a.title, a.relatedRoute ?? "", a.relatedIp ?? "", a.source].join("|")
    )
    .sort()
  return parts.join(";;")
}

// ─────────────────────────────────────────────
// Payload-Builder (reine Funktion, kein Versand)
// ─────────────────────────────────────────────

export function buildAdminNotificationPayload(
  alerts: SecurityAlert[],
  analysis: AiSecurityAnalysis
): AdminNotificationPayload | null {
  const activeAlerts = alerts.filter((a) => a.isActive)
  if (activeAlerts.length === 0) return null

  const criticalAlerts = activeAlerts.filter((a) => a.level === "critical")
  const warningAlerts = activeAlerts.filter((a) => a.level === "warning")
  const hasCritical = criticalAlerts.length > 0

  const subject = hasCritical
    ? "TSV BoxGym – kritische Sicherheitswarnung"
    : "TSV BoxGym – Sicherheitshinweis"

  const alertLines = criticalAlerts
    .map((a) => `- ${a.title}: ${a.message}`)
    .join("\n")

  const topRoute = criticalAlerts.find((a) => a.relatedRoute)?.relatedRoute ?? "–"
  const baseUrl = getAppBaseUrl()

  const body = [
    "Automatischer Sicherheitshinweis des KI-Sicherheitsmoduls.",
    "",
    `Gesamtstatus: ${analysis.overallRisk}`,
    `Erkannte Ereignisse: ${analysis.totalEvents} (hoch: ${analysis.highCount}, mittel: ${analysis.mediumCount})`,
    "",
    `Kritische Warnungen (${criticalAlerts.length}):`,
    alertLines || "– keine",
    "",
    `Hauptbetroffene Route: ${topRoute}`,
    `Zeitpunkt: ${new Date().toLocaleString("de-DE")}`,
    "",
    `Zur Prüfung: ${baseUrl}/verwaltung/ki`,
    "",
    "Es wurden keine automatischen Eingriffe vorgenommen.",
    "Dieser Hinweis enthält keine personenbezogenen Daten.",
  ].join("\n")

  const summary = hasCritical
    ? `${criticalAlerts.length} kritische und ${warningAlerts.length} weitere Warnung(en) aktiv.`
    : `${warningAlerts.length} Sicherheitswarnung(en) aktiv. Kein dringender Handlungsbedarf.`

  return { subject, body, summary }
}

// ─────────────────────────────────────────────
// Hauptfunktion: sende Benachrichtigung wenn nötig
// ─────────────────────────────────────────────

export async function sendAdminSecurityAlertsIfNeeded(
  alerts: SecurityAlert[],
  analysis: AiSecurityAnalysis,
  settings: AiSecuritySettings
): Promise<void> {
  // KI-System und Benachrichtigungen müssen aktiv sein
  if (!settings.ai_enabled || !settings.admin_alerts_enabled) return

  // Nur bei kritischen, aktiven Warnungen
  const criticalAlerts = alerts.filter((a) => a.isActive && a.level === "critical")
  if (criticalAlerts.length === 0) return

  const fingerprint = buildAlertFingerprint(alerts)
  if (!fingerprint) return

  try {
    // Cooldown prüfen
    const state = await readNotificationState()
    const now = Date.now()

    if (state.last_sent_at && state.last_fingerprint === fingerprint) {
      const lastSent = new Date(state.last_sent_at).getTime()
      if (now - lastSent < COOLDOWN_MS) return
    }

    // Payload erstellen
    const payload = buildAdminNotificationPayload(alerts, analysis)
    if (!payload) return

    // Empfänger: dedizierte SECURITY_ALERT_EMAIL oder Standard-Admin-Adresse
    const recipient = process.env.SECURITY_ALERT_EMAIL || getAdminNotificationAddress()

    await sendCustomEmail({
      to: recipient,
      subject: payload.subject,
      text: payload.body,
    })

    // Versandstatus persistieren
    await writeNotificationStateSafe({
      last_sent_at: new Date().toISOString(),
      last_fingerprint: fingerprint,
      last_subject: payload.subject,
    })
  } catch (err) {
    // Versandfehler nur intern loggen, nie nach außen propagieren
    console.error(
      "[KI-Sicherheit] Benachrichtigungsversand fehlgeschlagen:",
      err instanceof Error ? err.message : String(err)
    )
  }
}
