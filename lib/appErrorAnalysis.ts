import type { AppErrorRecord, AppErrorSummary, AppErrorSeverity } from "@/lib/appErrorsDb"

// ─── Typen ────────────────────────────────────────────────────────────────────

export type AppErrorStatus = "unauffällig" | "erhöht" | "kritisch"

export type AppErrorAlert = {
  level: "info" | "warning" | "critical"
  message: string
}

export type AppErrorAnalysis = {
  status: AppErrorStatus
  alerts: AppErrorAlert[]
  summaryText: string
}

// ─── Regelbasierte Analyse ────────────────────────────────────────────────────

/**
 * Bewertet eine Fehlerliste regelbasiert und gibt eine kurze Lageeinschätzung zurück.
 * Kein externer KI-Dienst — transparent und deterministisch.
 */
export function buildAppErrorSummaryText(
  errors: AppErrorRecord[],
  overview: AppErrorSummary
): string {
  if (errors.length === 0 && overview.totalOpen === 0) {
    return "Keine technischen Auffälligkeiten im gewählten Zeitraum."
  }

  const analysis = analyzeAppErrors(errors, overview)
  return analysis.summaryText
}

export function analyzeAppErrors(
  errors: AppErrorRecord[],
  overview: AppErrorSummary
): AppErrorAnalysis {
  const alerts: AppErrorAlert[] = buildAppErrorAlerts(errors, overview)

  let status: AppErrorStatus = "unauffällig"
  if (alerts.some((a) => a.level === "critical")) {
    status = "kritisch"
  } else if (alerts.some((a) => a.level === "warning")) {
    status = "erhöht"
  }

  const summaryText = buildSummaryText(errors, overview, status, alerts)

  return { status, alerts, summaryText }
}

export function buildAppErrorAlerts(
  errors: AppErrorRecord[],
  overview: AppErrorSummary
): AppErrorAlert[] {
  const alerts: AppErrorAlert[] = []

  // Kritische Fehler vorhanden
  if (overview.totalCritical > 0) {
    alerts.push({
      level: "critical",
      message: `${overview.totalCritical} kritische${overview.totalCritical === 1 ? "r" : ""} Fehler offen.`,
    })
  }

  // Gehäufte hohe Fehler
  const highCount = overview.bySeverity.high + overview.bySeverity.critical
  if (highCount >= 5) {
    alerts.push({
      level: "warning",
      message: `${highCount} Fehler mit Severity high/critical im Zeitraum.`,
    })
  }

  // Viele offene Fehler insgesamt
  if (overview.totalOpen >= 20) {
    alerts.push({
      level: "warning",
      message: `${overview.totalOpen} offene Fehler – bitte prüfen.`,
    })
  }

  // Gehäufte Mail-Fehler
  const mailErrors = errors.filter(
    (e) => e.source === "mail" && (e.status === "open" || e.status === "acknowledged")
  )
  if (mailErrors.length >= 3) {
    alerts.push({
      level: "warning",
      message: `Mail-Infrastruktur: ${mailErrors.length} Fehler auffällig (mögliche Störung).`,
    })
  }

  // Gleiche Route häuft sich
  const routeCounts = countBy(errors.filter((e) => !!e.route), (e) => e.route!)
  for (const [route, count] of Object.entries(routeCounts)) {
    if (count >= 5) {
      alerts.push({
        level: "warning",
        message: `Route ${route} meldet ${count} Fehler (gehäuft).`,
      })
    }
  }

  // Gehäufte Auth-Fehler (technisch, nicht normale Fehleingaben)
  const authErrors = errors.filter(
    (e) => e.source === "auth" && (e.status === "open" || e.status === "acknowledged")
  )
  if (authErrors.length >= 3) {
    alerts.push({
      level: "warning",
      message: `Auth-Bereich: ${authErrors.length} technische Fehler.`,
    })
  }

  return alerts
}

function buildSummaryText(
  errors: AppErrorRecord[],
  overview: AppErrorSummary,
  status: AppErrorStatus,
  alerts: AppErrorAlert[]
): string {
  if (status === "unauffällig") {
    if (overview.totalOpen === 0) {
      return "Keine offenen technischen Störungen."
    }
    return `${overview.totalOpen} offene Einträge – keine kritische Lage.`
  }

  if (status === "kritisch") {
    const firstAlert = alerts.find((a) => a.level === "critical")
    return firstAlert?.message ?? "Kritische technische Störung erkannt – bitte prüfen."
  }

  // erhöht
  const topAlert = alerts.find((a) => a.level === "warning") ?? alerts[0]
  if (topAlert) return topAlert.message

  return `${overview.totalOpen} offene Fehler im Zeitraum – erhöhte Aufmerksamkeit empfohlen.`
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of arr) {
    const k = key(item)
    result[k] = (result[k] ?? 0) + 1
  }
  return result
}

// Hilfe für Benachrichtigungsmodul
export function isAppErrorStateCritical(errors: AppErrorRecord[], overview: AppErrorSummary): boolean {
  const { status } = analyzeAppErrors(errors, overview)
  return status === "kritisch"
}

export function getSeverityLabel(severity: AppErrorSeverity): string {
  switch (severity) {
    case "critical": return "Kritisch"
    case "high": return "Hoch"
    case "medium": return "Mittel"
    case "low": return "Niedrig"
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "open": return "Offen"
    case "acknowledged": return "Geprüft"
    case "resolved": return "Gelöst"
    case "ignored": return "Ignoriert"
    default: return status
  }
}
