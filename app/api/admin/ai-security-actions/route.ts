import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import {
  listAiSecurityActions,
  upsertAiSecurityAction,
  isValidActionType,
  isValidTargetType,
} from "@/lib/aiSecurityActionsDb"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"

// ─────────────────────────────────────────────
// GET – alle aktiven Aktionen laden
// ─────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-ai-security-actions-get:${getRequestIp(request)}`,
      60,
      60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const actions = await listAiSecurityActions(200)
    return NextResponse.json({ actions })
  } catch (error) {
    console.error("ai-security-actions GET failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

// ─────────────────────────────────────────────
// POST – Aktion anlegen / aktualisieren
// ─────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-ai-security-actions-post:${getRequestIp(request)}`,
      30,
      60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new NextResponse("Invalid JSON", { status: 400 })
    }

    if (!body || typeof body !== "object") {
      return new NextResponse("Invalid request body", { status: 400 })
    }

    const input = body as Record<string, unknown>

    // Pflichtfelder validieren
    if (!isValidTargetType(input.target_type)) {
      return new NextResponse("Ungültiger target_type", { status: 400 })
    }
    if (!isValidActionType(input.action_type)) {
      return new NextResponse("Ungültiger action_type", { status: 400 })
    }
    if (typeof input.target_key !== "string" || !input.target_key.trim()) {
      return new NextResponse("target_key fehlt", { status: 400 })
    }

    // Notiz: nur plain text, kein HTML
    const rawNote = typeof input.note === "string" ? input.note.trim().slice(0, 1024) : null

    const result = await upsertAiSecurityAction({
      target_type: input.target_type,
      target_key: input.target_key.trim(),
      action_type: input.action_type,
      note: rawNote || null,
      created_by: session.accountEmail ?? null,
    })

    // Audit-Log – defensiv, nicht-blockierend
    try {
      const auditActionMap: Record<string, string> = {
        acknowledged: "ai_alert_acknowledged",
        muted: "ai_alert_muted",
        watchlist: "ai_watchlist_added",
      }
      await writeAdminAuditLog({
        session,
        action: auditActionMap[input.action_type] ?? "ai_security_action",
        targetType: input.target_type,
        targetId: input.target_key.trim(),
        targetName: null,
        details: rawNote ? `Notiz: ${rawNote.slice(0, 100)}` : null,
      })
    } catch {
      // Audit-Log-Fehler nicht propagieren
    }

    if (!result) {
      // Tabelle fehlt noch oder DB offline – sauber fallback
      return NextResponse.json({ ok: true, action: null, tableNotReady: true })
    }

    return NextResponse.json({ ok: true, action: result })
  } catch (error) {
    console.error("ai-security-actions POST failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
