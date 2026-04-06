import type { AppErrorRecord } from "@/lib/appErrorsDb"
import { getAdminNotificationAddress, getMailFromAddress, getAppBaseUrl } from "@/lib/mailConfig"
import { getSeverityLabel } from "@/lib/appErrorAnalysis"

// ─── Cooldown (in-memory, reicht für serverlose Umgebung) ─────────────────────
// Pro Fingerprint wird ein Cooldown von 1 Stunde eingehalten, um Mail-Flut zu vermeiden.
// In serverlosen Umgebungen (Vercel) verliert dieser Zustand bei Cold Starts — das ist
// bewusst akzeptiert; lieber gelegentlich eine doppelte Mail als gar keine.

const notifiedFingerprints = new Map<string, number>()
const COOLDOWN_MS = 60 * 60 * 1000 // 1 Stunde

function isCooledDown(fingerprint: string): boolean {
  const last = notifiedFingerprints.get(fingerprint)
  if (!last) return false
  return Date.now() - last < COOLDOWN_MS
}

function markNotified(fingerprint: string) {
  notifiedFingerprints.set(fingerprint, Date.now())
}

// ─── Mail-Payload ─────────────────────────────────────────────────────────────

export type AppErrorNotificationPayload = {
  to: string
  subject: string
  text: string
}

export function buildAppErrorNotificationPayload(error: AppErrorRecord): AppErrorNotificationPayload {
  const appBaseUrl = getAppBaseUrl()
  const link = `${appBaseUrl}/verwaltung/fehler`
  const severityLabel = getSeverityLabel(error.severity)

  const subject = `[TSV BoxGym] Kritischer App-Fehler: ${error.source} – ${error.error_type}`

  const text = [
    `TSV BoxGym – Kritischer technischer Fehler`,
    ``,
    `Schwere:     ${severityLabel}`,
    `Quelle:      ${error.source}`,
    `Typ:         ${error.error_type}`,
    error.route ? `Route:       ${error.route}` : null,
    `Meldung:     ${error.message}`,
    `Auftreten:   ${error.occurrence_count}`,
    `Zuletzt:     ${new Date(error.last_seen_at).toLocaleString("de-DE")}`,
    ``,
    `Details im Admin-Fehlerbereich:`,
    link,
    ``,
    `Diese Benachrichtigung wurde automatisch durch das Fehlermodul versendet.`,
  ]
    .filter((line) => line !== null)
    .join("\n")

  return {
    to: getAdminNotificationAddress(),
    subject,
    text,
  }
}

// ─── Versand ──────────────────────────────────────────────────────────────────

/**
 * Sendet eine Admin-Mail, wenn der Fehler kritisch ist und kein Cooldown aktiv ist.
 * Wirft NIE — safe by design.
 */
export async function sendAdminAppErrorNotificationIfNeeded(error: AppErrorRecord): Promise<void> {
  try {
    // Nur bei kritischer Severity
    if (error.severity !== "critical") return

    const fingerprint = error.fingerprint ?? `${error.source}|${error.error_type}`
    if (isCooledDown(fingerprint)) return

    const getResendApiKey = () => {
      const serverKey = process.env.RESEND_API_KEY
      const devFallback = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_RESEND_API_KEY : undefined
      return serverKey || devFallback
    }

    const apiKey = getResendApiKey()
    if (!apiKey) return // Keine Mailkonfiguration → still abbrechen

    const payload = buildAppErrorNotificationPayload(error)
    const from = getMailFromAddress()

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
      }),
    })

    if (response.ok) {
      markNotified(fingerprint)
    } else {
      console.warn("[appErrorNotifications] Mail-Versand fehlgeschlagen:", await response.text())
    }
  } catch (err) {
    // Benachrichtigungs-Fehler dürfen nie den Hauptflow blockieren
    console.warn("[appErrorNotifications] sendAdminAppErrorNotificationIfNeeded failed:", err)
  }
}
