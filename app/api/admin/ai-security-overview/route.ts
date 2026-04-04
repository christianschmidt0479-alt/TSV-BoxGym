import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { readAiSettings } from "@/lib/aiSettingsDb"
import { readAiSecurityEvents, createAiSecurityEventSafe } from "@/lib/aiSecurityEventsDb"
import { getAdminAuditLogs } from "@/lib/adminAuditLogDb"
import { analyzeSecurityEvents, anonymizeIp, buildSecurityAlerts, SECURITY_EVENT_TYPES } from "@/lib/aiSecurity"
import {
  parseDashboardRange,
  filterEventsByRange,
  buildTrendBuckets,
  buildTopRoutes,
  buildTopIps,
  buildEventTypeBreakdown,
} from "@/lib/aiSecurity"
import type { SecurityEvent } from "@/lib/aiSecurity"
import { sendAdminSecurityAlertsIfNeeded, readNotificationState } from "@/lib/aiSecurityNotifications"
import { getActionStatesForTargets } from "@/lib/aiSecurityActionsDb"
import type { ActionState } from "@/lib/aiSecurityActionsDb"
import { getBlockStatesForTargets, listAiSecurityBlocks, cleanupExpiredAiSecurityBlocks } from "@/lib/aiSecurityBlocksDb"
import type { BlockState } from "@/lib/aiSecurityBlocksDb"

// Admin-Aktionen die als sicherheitsrelevant gelten
const HIGH_SEVERITY_AUDIT_ACTIONS = new Set(["member_deleted"])
const MEDIUM_SEVERITY_AUDIT_ACTIONS = new Set([
  "member_approved",
  "member_parent_unlinked",
  "member_group_changed",
])

function auditLogToSecurityEvent(row: {
  id: string
  created_at: string
  action: string
  actor_email: string | null
  actor_name: string | null
  target_name: string | null
  details: string | null
}): SecurityEvent {
  const severity = HIGH_SEVERITY_AUDIT_ACTIONS.has(row.action)
    ? "high"
    : MEDIUM_SEVERITY_AUDIT_ACTIONS.has(row.action)
    ? "medium"
    : "low"

  return {
    id: row.id,
    created_at: row.created_at,
    type: row.action,
    route: null,
    ip: null,
    actor: row.actor_name ?? row.actor_email ?? null,
    severity,
    detail: row.details ?? row.target_name ?? null,
    source: "admin_audit_log",
  }
}

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      void createAiSecurityEventSafe({
        type: SECURITY_EVENT_TYPES.AUTH_DENIED,
        route: "/api/admin/ai-security-overview",
        ip: getRequestIp(request),
        actor: session?.accountEmail ?? null,
        severity: "high",
        detail: "Unbefugter Zugriffsversuch auf KI-Sicherheitsübersicht",
        source: "admin/ai-security-overview",
      })
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-ai-security-overview:${getRequestIp(request)}`,
      30,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    // range-Parameter auslesen
    const url = new URL(request.url)
    const range = parseDashboardRange(url.searchParams.get("range"))

    // Mehr Events holen für Trend-Berechnungen (30d benötigt mehr)
    const eventLimit = range === "30d" ? 500 : range === "7d" ? 300 : 150

    const [settings, dedicatedEvents, auditRows] = await Promise.all([
      readAiSettings(),
      readAiSecurityEvents(eventLimit),
      getAdminAuditLogs(50),
    ])

    // Audit-Log in SecurityEvents umwandeln und zusammenführen
    const auditEvents: SecurityEvent[] = auditRows.map(auditLogToSecurityEvent)

    const allEvents: SecurityEvent[] = [
      ...dedicatedEvents,
      ...auditEvents,
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Aktuelle Analyse über alle Events (für Sicherheitslage und Alerts)
    const analysis = analyzeSecurityEvents(allEvents)
    const alerts = buildSecurityAlerts(allEvents, analysis, settings)

    // Benachrichtigung asynchron und defensiv auslösen (fire-and-forget)
    void sendAdminSecurityAlertsIfNeeded(alerts, analysis, settings)

    // Versandstatus für UI laden
    const notificationState = await readNotificationState()

    // Dashboard-Aggregationen über gefilterte Events für den gewählten Zeitraum
    const rangeEvents = filterEventsByRange(allEvents, range)
    // IPs anonymisieren vor Aggregation
    const rangeEventsAnon = rangeEvents.map((e) => ({ ...e, ip: e.ip ?? null }))

    const trendBuckets = buildTrendBuckets(rangeEventsAnon, range)
    const topRoutes = buildTopRoutes(rangeEventsAnon)
    const topIps = buildTopIps(rangeEventsAnon) // anonymisiert intern
    const eventTypeBreakdown = buildEventTypeBreakdown(rangeEventsAnon)

    // Alert-Historie: letzte 20 aktive/abgeleitete Alerts (nicht nur aktuell aktive)
    const alertHistory = alerts.slice(0, 20)

    // Action-States für Alerts und Top-IPs/-Routen laden
    const alertKeys = alerts.map((a) => a.id)
    const ipKeys = topIps.map((e) => e.ip)
    const routeKeys = topRoutes.map((r) => r.route)
    const allTargetKeys = [...new Set([...alertKeys, ...ipKeys, ...routeKeys])]
    const actionStateMap = await getActionStatesForTargets(allTargetKeys)

    // Block-States für IPs und Routen laden + abgelaufene Blocks bereinigen (fire-and-forget)
    void cleanupExpiredAiSecurityBlocks()
    const blockStateMap = await getBlockStatesForTargets([...ipKeys, ...routeKeys])
    const activeBlocks = await listAiSecurityBlocks()

    // Action-State als plain object serialisieren
    const actionStates: Record<string, ActionState> = {}
    for (const [key, state] of actionStateMap.entries()) {
      actionStates[key] = state
    }

    // Block-State als plain object serialisieren
    const blockStates: Record<string, BlockState> = {}
    for (const [key, state] of blockStateMap.entries()) {
      blockStates[key] = state
    }

    // IPs in der Event-Liste anonymisieren vor Ausgabe
    const safeEvents = allEvents.slice(0, 50).map((e) => ({
      ...e,
      ip: anonymizeIp(e.ip),
    }))

    return NextResponse.json({
      settings,
      analysis,
      alerts,
      events: safeEvents,
      notificationState,
      range,
      trendBuckets,
      topRoutes,
      topIps,
      alertHistory,
      eventTypeBreakdown,
      actionStates,
      blockStates,
      activeBlocks,
    })
  } catch (error) {
    console.error("ai-security-overview GET failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
