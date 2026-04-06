import type { AppErrorInput, AppErrorSeverity } from "@/lib/appErrorsDb"
import { upsertAppErrorSafe } from "@/lib/appErrorsDb"
import { sendAdminAppErrorNotificationIfNeeded } from "@/lib/appErrorNotifications"

// ─── Sanitizing ───────────────────────────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /bearer/i,
  /authorization/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /^\s*eyJ/i, // JWT
]

/**
 * Gibt eine sichere, begrenzte Fehlermeldung zurück.
 * Filtert sensible Inhalte aus.
 */
export function normalizeErrorMessage(err: unknown): string {
  if (!err) return "Unknown error"
  if (typeof err === "string") return sanitizeText(err, 500)
  if (err instanceof Error) return sanitizeText(err.message, 500)
  try {
    return sanitizeText(String(err), 500)
  } catch {
    return "Unknown error"
  }
}

function sanitizeText(text: string, maxLength: number): string {
  let result = text.trim()

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(result)) {
      return "[redacted: suspected sensitive content]"
    }
  }

  return result.slice(0, maxLength)
}

/**
 * Sanitiert Details-Objekte/Strings vor dem Speichern.
 * - Max. 2000 Zeichen
 * - Kein direkter Fehler-Stack ohne Prüfung
 * - Sensible Felder entfernen
 */
export function sanitizeErrorDetails(data: unknown): string | null {
  if (!data) return null

  let text: string
  if (typeof data === "string") {
    text = data
  } else {
    try {
      text = JSON.stringify(data, (key, value) => {
        if (SENSITIVE_PATTERNS.some((p) => p.test(String(key)))) return "[redacted]"
        return value
      })
    } catch {
      text = String(data)
    }
  }

  return sanitizeText(text, 2000)
}

// ─── Reporter ─────────────────────────────────────────────────────────────────

export type ReportAppErrorInput = {
  source: string
  route?: string | null
  error_type: string
  severity: AppErrorSeverity
  message: string
  details?: unknown
  actor?: string | null
  actor_role?: string | null
  ip?: string | null
}

/**
 * Meldet einen App-Fehler (mit Upsert-Logik für wiederholte Fehler).
 * Wirft NIE — safe by design.
 */
export async function reportAppErrorSafe(input: ReportAppErrorInput): Promise<void> {
  try {
    const errorInput: AppErrorInput = {
      source: (input.source ?? "unknown").slice(0, 100),
      route: input.route?.slice(0, 200) ?? null,
      error_type: (input.error_type ?? "unknown").slice(0, 100),
      severity: input.severity ?? "medium",
      message: normalizeErrorMessage(input.message),
      details: sanitizeErrorDetails(input.details),
      actor: input.actor?.slice(0, 200) ?? null,
      actor_role: input.actor_role?.slice(0, 50) ?? null,
      ip: input.ip?.slice(0, 64) ?? null,
    }

    const record = await upsertAppErrorSafe(errorInput)

    // Kritische Fehler asynchron per Mail melden (kein await blockiert den Caller)
    if (record && record.severity === "critical") {
      void sendAdminAppErrorNotificationIfNeeded(record)
    }
  } catch {
    // Fehlermodul schlägt still fehl — kein Hauptflow-Impact
  }
}

/**
 * Vereinfachter Helper für schnelle Einsatzpunkte.
 */
export async function reportAppError(
  source: string,
  errorType: string,
  severity: AppErrorSeverity,
  err: unknown,
  extra?: Partial<Pick<ReportAppErrorInput, "route" | "details" | "actor" | "actor_role" | "ip">>
): Promise<void> {
  await reportAppErrorSafe({
    source,
    error_type: errorType,
    severity,
    message: normalizeErrorMessage(err),
    ...extra,
  })
}
