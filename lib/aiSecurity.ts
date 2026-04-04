// KI-Sicherheitsmodul – regelbasierte Analyse, keine aktive Sperrentscheidung

// ─────────────────────────────────────────────
// Security-Event-Typ-Konstanten
// ─────────────────────────────────────────────

export const SECURITY_EVENT_TYPES = {
  LOGIN_FAILURE: "login_failure",
  LOGIN_LOCK: "login_lock",
  RATE_LIMIT: "rate_limit",
  AUTH_DENIED: "auth_denied",
  SUSPICIOUS_REQUEST: "suspicious_request",
  ADMIN_SECURITY_ACTION: "admin_security_action",
  API_ERROR_SECURITY_RELEVANT: "api_error_security_relevant",
  MANUAL_BLOCK_HIT: "manual_block_hit",
} as const

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[keyof typeof SECURITY_EVENT_TYPES]

// ─────────────────────────────────────────────
// Typen
// ─────────────────────────────────────────────

export type AiSecuritySettings = {
  ai_enabled: boolean
  brute_force_detection_enabled: boolean
  auto_block_suspicious_ips: boolean
  admin_alerts_enabled: boolean
  updated_at: string | null
}

export type SecurityEvent = {
  id: string
  created_at: string
  type: string
  route: string | null
  ip: string | null
  actor: string | null
  severity: "low" | "medium" | "high"
  detail: string | null
  source: string
}

export type AiSecurityAnalysis = {
  totalEvents: number
  highCount: number
  mediumCount: number
  lowCount: number
  overallRisk: "unauffällig" | "erhöht" | "kritisch"
  suspiciousRoutes: string[]
  suspiciousIps: string[]
  lastIncident: string | null
  summaryText: string
}

export type SecurityAlert = {
  id: string
  created_at: string
  level: "info" | "warning" | "critical"
  title: string
  message: string
  relatedRoute: string | null
  relatedIp: string | null
  source: string
  isActive: boolean
}

// ─────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────

export function defaultAiSecuritySettings(): AiSecuritySettings {
  return {
    ai_enabled: false,
    brute_force_detection_enabled: false,
    auto_block_suspicious_ips: false,
    admin_alerts_enabled: false,
    updated_at: null,
  }
}

export function emptyAnalysis(): AiSecurityAnalysis {
  return {
    totalEvents: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    overallRisk: "unauffällig",
    suspiciousRoutes: [],
    suspiciousIps: [],
    lastIncident: null,
    summaryText: "Derzeit keine Sicherheitsereignisse vorhanden.",
  }
}

// ─────────────────────────────────────────────
// IP-Anonymisierung (DSGVO-sensibel)
// ─────────────────────────────────────────────

export function anonymizeIp(ip: string | null): string {
  if (!ip || ip === "unknown") return "unbekannt"
  // IPv4: letzte Stelle maskieren
  const ipv4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/)
  if (ipv4) return `${ipv4[1]}.x`
  // IPv6: nur Prefix zeigen
  const parts = ip.split(":")
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}:…`
  return "***"
}

// ─────────────────────────────────────────────
// Einzelereignis: Schwere bestimmen
// ─────────────────────────────────────────────

export function analyzeSecurityEvent(event: SecurityEvent): { severity: SecurityEvent["severity"]; reason: string } {
  const { type } = event

  if (type === "login_failure") {
    return { severity: "medium", reason: "Fehlgeschlagener Login-Versuch" }
  }
  if (type === "rate_limit") {
    return { severity: "medium", reason: "Rate-Limit ausgelöst" }
  }
  if (type === "member_deleted" || type === "suspicious_request") {
    return { severity: "high", reason: "Kritische Admin-Aktion oder verdächtiger Request" }
  }
  if (type === "api_error") {
    return { severity: "low", reason: "API-Fehler (normal)" }
  }

  return { severity: event.severity, reason: "Bekanntes Ereignis" }
}

// ─────────────────────────────────────────────
// Mehrere Ereignisse analysieren
// ─────────────────────────────────────────────

export function analyzeSecurityEvents(events: SecurityEvent[]): AiSecurityAnalysis {
  if (events.length === 0) return emptyAnalysis()

  // IP-Häufigkeit
  const ipCounts = new Map<string, number>()
  const routeCounts = new Map<string, number>()
  let highCount = 0
  let mediumCount = 0
  let lowCount = 0

  const windowMs = 60 * 60 * 1000 // 1 Stunde
  const now = Date.now()
  const recentEvents = events.filter((e) => now - new Date(e.created_at).getTime() < windowMs)

  for (const event of events) {
    const enriched = analyzeSecurityEvent(event)
    const sev = event.severity === "high" || event.severity === "medium" ? event.severity : enriched.severity
    if (sev === "high") highCount++
    else if (sev === "medium") mediumCount++
    else lowCount++
  }

  for (const event of recentEvents) {
    if (event.ip && event.ip !== "unknown") {
      ipCounts.set(event.ip, (ipCounts.get(event.ip) ?? 0) + 1)
    }
    if (event.route) {
      routeCounts.set(event.route, (routeCounts.get(event.route) ?? 0) + 1)
    }
  }

  // IPs mit > 3 Ereignissen in 1h = auffällig
  const suspiciousIps = [...ipCounts.entries()]
    .filter(([, count]) => count > 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ip]) => anonymizeIp(ip))

  // Routen mit > 5 Ereignissen in 1h = auffällig
  const suspiciousRoutes = [...routeCounts.entries()]
    .filter(([, count]) => count > 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([route]) => route)

  const lastIncident =
    events.find((e) => e.severity === "high" || e.severity === "medium")?.created_at ?? events[0]?.created_at ?? null

  const overallRisk: AiSecurityAnalysis["overallRisk"] =
    highCount > 0 ? "kritisch" : mediumCount > 0 ? "erhöht" : "unauffällig"

  const summaryText = buildSummaryText({ overallRisk, highCount, mediumCount, suspiciousRoutes, suspiciousIps })

  return {
    totalEvents: events.length,
    highCount,
    mediumCount,
    lowCount,
    overallRisk,
    suspiciousRoutes,
    suspiciousIps,
    lastIncident,
    summaryText,
  }
}

function buildSummaryText(opts: {
  overallRisk: AiSecurityAnalysis["overallRisk"]
  highCount: number
  mediumCount: number
  suspiciousRoutes: string[]
  suspiciousIps: string[]
}): string {
  if (opts.overallRisk === "unauffällig") {
    return "Sicherheitslage unauffällig. Derzeit keine erhöhten oder kritischen Ereignisse erkannt."
  }

  const parts: string[] = []

  if (opts.overallRisk === "kritisch") {
    parts.push(`${opts.highCount} kritische Sicherheitsereignisse erfasst.`)
    parts.push("Sofortige Überprüfung empfohlen.")
  } else {
    parts.push(`${opts.mediumCount} erhöhte Ereignisse in der beobachteten Periode erkannt.`)
    parts.push("Erhöhte Aufmerksamkeit empfohlen.")
  }

  if (opts.suspiciousRoutes.length > 0) {
    const routeList = opts.suspiciousRoutes.slice(0, 2).join(" und ")
    parts.push(`Auffällige Aktivität auf ${routeList} erkannt.`)
  }
  if (opts.suspiciousIps.length > 0) {
    const ipList = opts.suspiciousIps.slice(0, 2).join(", ")
    parts.push(`Wiederholt auffällige IPs: ${ipList}.`)
  }

  return parts.join(" ")
}

// ─────────────────────────────────────────────
// Warnungen ableiten
// ─────────────────────────────────────────────

export function buildSecurityAlerts(
  events: SecurityEvent[],
  analysis: AiSecurityAnalysis,
  settings: AiSecuritySettings
): SecurityAlert[] {
  // Wenn KI deaktiviert: keine Warnungen erzeugen
  if (!settings.ai_enabled) return []
  if (events.length === 0) return []

  const alerts: SecurityAlert[] = []
  const now = Date.now()
  const hourMs = 60 * 60 * 1000
  const recentEvents = events.filter((e) => now - new Date(e.created_at).getTime() < hourMs)

  // Regel 1: Mehrfache Login-Fehler auf gleicher Route
  const loginFailures = recentEvents.filter((e) => e.type === "login_failure")
  if (loginFailures.length > 0) {
    const byRoute = new Map<string, SecurityEvent[]>()
    for (const e of loginFailures) {
      const key = e.route ?? "__none__"
      const list = byRoute.get(key) ?? []
      list.push(e)
      byRoute.set(key, list)
    }
    for (const [route, evts] of byRoute.entries()) {
      if (evts.length >= 3) {
        const displayRoute = route === "__none__" ? null : route
        alerts.push({
          id: `login-failure:${route}`,
          created_at: evts[0].created_at,
          level: evts.length >= 5 ? "critical" : "warning",
          title: "Mehrfache fehlgeschlagene Login-Versuche",
          message: `${evts.length} fehlgeschlagene Login-Versuche${displayRoute ? ` auf ${displayRoute}` : ""} in der letzten Stunde erkannt. Erhöhte Aufmerksamkeit empfohlen.`,
          relatedRoute: displayRoute,
          relatedIp: null,
          source: "rule:login_failures",
          isActive: true,
        })
      }
    }
  }

  // Regel 2: Auffällige IP-Adresse (> 5 Ereignisse in 1h)
  const ipCounts = new Map<string, number>()
  for (const e of recentEvents) {
    if (e.ip && e.ip !== "unknown") {
      ipCounts.set(e.ip, (ipCounts.get(e.ip) ?? 0) + 1)
    }
  }
  for (const [ip, count] of ipCounts.entries()) {
    if (count > 5) {
      const anonIp = anonymizeIp(ip)
      alerts.push({
        id: `suspicious-ip:${anonIp}`,
        created_at: new Date(now).toISOString(),
        level: count > 10 ? "critical" : "warning",
        title: "Auffällige IP-Adresse erkannt",
        message: `IP ${anonIp} hat ${count} Anfragen in der letzten Stunde ausgelöst.`,
        relatedRoute: null,
        relatedIp: anonIp,
        source: "rule:suspicious_ip",
        isActive: true,
      })
    }
  }

  // Regel 3: Kritische Gesamtlage ohne vorhandenen kritischen Alert
  if (analysis.overallRisk === "kritisch" && analysis.highCount > 0) {
    if (!alerts.some((a) => a.level === "critical")) {
      alerts.push({
        id: "overall-critical",
        created_at: analysis.lastIncident ?? new Date(now).toISOString(),
        level: "critical",
        title: "Kritische Sicherheitslage",
        message: `${analysis.highCount} kritische Sicherheitsereignisse erfasst. Überprüfung empfohlen.`,
        relatedRoute: analysis.suspiciousRoutes[0] ?? null,
        relatedIp: null,
        source: "rule:overall_risk",
        isActive: true,
      })
    }
  }

  // Regel 4: Ungewöhnlich viele Ereignisse in 15 Minuten
  const shortWindowMs = 15 * 60 * 1000
  const veryRecent = events.filter((e) => now - new Date(e.created_at).getTime() < shortWindowMs)
  if (veryRecent.length >= 10) {
    alerts.push({
      id: "high-volume",
      created_at: veryRecent[0]?.created_at ?? new Date(now).toISOString(),
      level: veryRecent.length >= 20 ? "critical" : "warning",
      title: "Erhöhtes Ereignisvolumen",
      message: `${veryRecent.length} Sicherheitsereignisse in den letzten 15 Minuten registriert.`,
      relatedRoute: null,
      relatedIp: null,
      source: "rule:high_volume",
      isActive: true,
    })
  }

  // Regel 5: Rate-Limit mehrfach ausgelöst
  const rateLimitHits = recentEvents.filter((e) => e.type === "rate_limit")
  if (rateLimitHits.length >= 3) {
    alerts.push({
      id: "rate-limit-frequent",
      created_at: rateLimitHits[0].created_at,
      level: "warning",
      title: "Rate-Limit mehrfach ausgelöst",
      message: `Rate-Limit ${rateLimitHits.length}-mal in der letzten Stunde ausgelöst.`,
      relatedRoute: rateLimitHits[0].route ?? null,
      relatedIp: rateLimitHits[0].ip ? anonymizeIp(rateLimitHits[0].ip) : null,
      source: "rule:rate_limits",
      isActive: true,
    })
  }

  return alerts
}

// ─────────────────────────────────────────────
// Placeholder – keine aktive Sperrentscheidung
// ─────────────────────────────────────────────

export function shouldBlockRequest() {
  // Hinweis: Gibt bewusst immer false zurück.
  // Automatische Sperren sind nicht aktiv.
  return false
}

// ─────────────────────────────────────────────
// Dashboard-Typen
// ─────────────────────────────────────────────

export type DashboardRange = "24h" | "7d" | "30d"

export type TrendBucket = {
  label: string
  total: number
  high: number
  medium: number
  low: number
}

export type TopRoute = {
  route: string
  count: number
  highCount: number
}

export type TopIp = {
  ip: string // anonymisiert
  count: number
  highCount: number
}

export type EventTypeBreakdownEntry = {
  type: string
  count: number
}

export type DashboardData = {
  range: DashboardRange
  trendBuckets: TrendBucket[]
  topRoutes: TopRoute[]
  topIps: TopIp[]
  alertHistory: SecurityAlert[]
  eventTypeBreakdown: EventTypeBreakdownEntry[]
}

// ─────────────────────────────────────────────
// Dashboard-Helper
// ─────────────────────────────────────────────

/** Gibt den Cutoff-Zeitpunkt (ms) für den gewählten Zeitraum zurück */
export function getRangeCutoff(range: DashboardRange): number {
  const now = Date.now()
  if (range === "7d") return now - 7 * 24 * 60 * 60 * 1000
  if (range === "30d") return now - 30 * 24 * 60 * 60 * 1000
  return now - 24 * 60 * 60 * 1000
}

/** Filtert Events auf den angegebenen Zeitraum */
export function filterEventsByRange(events: SecurityEvent[], range: DashboardRange): SecurityEvent[] {
  const cutoff = getRangeCutoff(range)
  return events.filter((e) => new Date(e.created_at).getTime() >= cutoff)
}

/** Erzeugt Trend-Buckets für den gewählten Zeitraum */
export function buildTrendBuckets(events: SecurityEvent[], range: DashboardRange): TrendBucket[] {
  if (range === "24h") {
    // 24 Stunden-Buckets (stündlich)
    const buckets: TrendBucket[] = []
    const now = Date.now()
    for (let i = 23; i >= 0; i--) {
      const bucketStart = now - (i + 1) * 60 * 60 * 1000
      const bucketEnd = now - i * 60 * 60 * 1000
      const inBucket = events.filter((e) => {
        const t = new Date(e.created_at).getTime()
        return t >= bucketStart && t < bucketEnd
      })
      const hour = new Date(bucketEnd).getHours().toString().padStart(2, "0")
      buckets.push({
        label: `${hour}:00`,
        total: inBucket.length,
        high: inBucket.filter((e) => e.severity === "high").length,
        medium: inBucket.filter((e) => e.severity === "medium").length,
        low: inBucket.filter((e) => e.severity === "low").length,
      })
    }
    return buckets
  }

  // 7d oder 30d: tägliche Buckets
  const days = range === "30d" ? 30 : 7
  const buckets: TrendBucket[] = []
  const now = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    const bucketStart = now - (i + 1) * 24 * 60 * 60 * 1000
    const bucketEnd = now - i * 24 * 60 * 60 * 1000
    const inBucket = events.filter((e) => {
      const t = new Date(e.created_at).getTime()
      return t >= bucketStart && t < bucketEnd
    })
    const d = new Date(bucketEnd)
    const label = `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.`
    buckets.push({
      label,
      total: inBucket.length,
      high: inBucket.filter((e) => e.severity === "high").length,
      medium: inBucket.filter((e) => e.severity === "medium").length,
      low: inBucket.filter((e) => e.severity === "low").length,
    })
  }
  return buckets
}

/** Top Routen nach Häufigkeit im Zeitraum */
export function buildTopRoutes(events: SecurityEvent[], limit = 8): TopRoute[] {
  const routeMap = new Map<string, { count: number; highCount: number }>()
  for (const e of events) {
    if (!e.route) continue
    const entry = routeMap.get(e.route) ?? { count: 0, highCount: 0 }
    entry.count++
    if (e.severity === "high") entry.highCount++
    routeMap.set(e.route, entry)
  }
  return [...routeMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([route, v]) => ({ route, ...v }))
}

/** Top IPs nach Häufigkeit im Zeitraum (nur anonymisiert) */
export function buildTopIps(events: SecurityEvent[], limit = 8): TopIp[] {
  const ipMap = new Map<string, { count: number; highCount: number }>()
  for (const e of events) {
    if (!e.ip || e.ip === "unknown") continue
    const anonIp = anonymizeIp(e.ip)
    const entry = ipMap.get(anonIp) ?? { count: 0, highCount: 0 }
    entry.count++
    if (e.severity === "high") entry.highCount++
    ipMap.set(anonIp, entry)
  }
  return [...ipMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([ip, v]) => ({ ip, ...v }))
}

/** Verteilung der Eventtypen im Zeitraum */
export function buildEventTypeBreakdown(events: SecurityEvent[]): EventTypeBreakdownEntry[] {
  const typeMap = new Map<string, number>()
  for (const e of events) {
    typeMap.set(e.type, (typeMap.get(e.type) ?? 0) + 1)
  }
  return [...typeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }))
}

/** Parst den range-Query-Parameter defensiv */
export function parseDashboardRange(raw: string | null): DashboardRange {
  if (raw === "7d" || raw === "30d") return raw
  return "24h"
}
