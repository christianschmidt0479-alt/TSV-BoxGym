/**
 * Zentrales Error-Handling für die App
 * Kategorisiert Fehler und bietet aussagekräftige Meldungen
 */

export type ErrorCategory = 
  | "validation"
  | "not_found"
  | "limit_exceeded"
  | "network"
  | "auth"
  | "database"
  | "unknown"

export class AppError extends Error {
  constructor(
    public message: string,
    public category: ErrorCategory,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = "AppError"
  }

  getUserMessage(): string {
    return this.message
  }

  isDev(): boolean {
    return process.env.NODE_ENV === "development" && !!this.details
  }
}

/**
 * Hilfsfunktionen zur Error-Behandlung
 */

export function throwValidationError(field: string, message: string): never {
  throw new AppError(message, "validation", { field })
}

export function throwNotFoundError(entity: string, identifier?: string): never {
  const message = identifier 
    ? `${entity} mit ID ${identifier} nicht gefunden.`
    : `${entity} nicht gefunden.`
  throw new AppError(message, "not_found", { entity, identifier })
}

export function throwLimitExceededError(resource: string, limit: number, used: number): never {
  const message = `${resource}-Limit erreicht (${used}/${limit}).`
  throw new AppError(message, "limit_exceeded", { resource, limit, used })
}

export function throwNetworkError(endpoint?: string): never {
  const message = endpoint 
    ? `Verbindungsfehler bei ${endpoint}. Bitte später versuchen.`
    : "Netzwerkfehler. Bitte Internetverbindung prüfen und später versuchen."
  throw new AppError(message, "network", { endpoint })
}

export function throwAuthError(reason?: string): never {
  const message = reason || "Authentifizierung erforderlich."
  throw new AppError(message, "auth", { reason })
}

export function throwDatabaseError(operation?: string): never {
  const message = operation 
    ? `Datenbankfehler bei ${operation}. Bitte Admin kontaktieren.`
    : "Datenbankfehler. Bitte Admin kontaktieren."
  throw new AppError(message, "database", { operation })
}

/**
 * Fehler aus Supabase oder anderen Quellen konvertieren
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  const normalized = (error && typeof error === "object") ? error as { code?: string; message?: string } : {}

  if (normalized && normalized.code === "PGRST116") {
    // Supabase: Entity not found
    return new AppError(
      "Datensatz nicht gefunden.",
      "not_found",
      { originalError: normalized.message }
    )
  }

  if (normalized && normalized.message?.includes("network")) {
    return new AppError(
      "Netzwerkfehler. Bitte später versuchen.",
      "network",
      { originalError: normalized.message }
    )
  }

  if (normalized && normalized.message?.includes("auth")) {
    return new AppError(
      "Authentifizierung erforderlich.",
      "auth",
      { originalError: normalized.message }
    )
  }

  // Standard unknown error
  return new AppError(
    "Ein unerwarteter Fehler ist aufgetreten. Bitte später versuchen.",
    "unknown",
    {
      originalError: normalized && normalized.message ? normalized.message : String(error),
    }
  )
}

/**
 * Error-Meldungen für häufige Szenarien
 */
export const ErrorMessages = {
  MEMBER_NOT_FOUND: "Mitglied nicht gefunden oder PIN nicht korrekt.",
  TRIAL_NOT_FOUND: "Probetraining-Datensatz nicht gefunden.",
  INVALID_PIN: "PIN nicht korrekt. Bitte erneut versuchen.",
  EMAIL_NOT_VERIFIED: "E-Mail noch nicht bestätigt. Bitte zuerst den Bestätigungs-Link öffnen.",
  NOT_APPROVED: "Dein Konto wurde noch nicht freigegeben. Bitte Trainer oder Admin fragen.",
  TRIAL_LIMIT_EXCEEDED: "Probetraining abgeschlossen. Du hast bereits 3 Trainingseinheiten besucht.",
  TEMP_LIMIT_EXCEEDED: "Ohne Admin-Freigabe sind maximal 6 Trainingseinheiten möglich. Bitte Trainer oder Admin ansprechen.",
  CHECKIN_UNAVAILABLE: "Check-in ist für diese Gruppe aktuell nicht möglich.",
  SERVICE_ERROR: "Fehler beim Speichern. Bitte später versuchen.",
  NETWORK_ERROR: "Verbindungsfehler. Bitte später versuchen.",
  EMAIL_SEND_ERROR: "Bestätigungs-E-Mail konnte nicht versendet werden.",
  UNKNOWN_ERROR: "Ein unerwarteter Fehler ist aufgetreten.",
} as const

/**
 * Logging für Fehler (optional: an Analytics senden)
 */
export function logError(error: AppError, context?: string): void {
  const isDev = process.env.NODE_ENV === "development"
  
  if (isDev) {
    console.error(
      `[${error.category}] ${context || "Fehler"}:`,
      error.message,
      error.details
    )
  }
  
  // TODO: Später an Analytics/Sentry senden
}
