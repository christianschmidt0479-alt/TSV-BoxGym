import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import {
  listAiSecurityBlocks,
  createAiSecurityBlock,
  deactivateAiSecurityBlock,
  isValidBlockDuration,
  isValidTargetType,
  BLOCK_REASONS,
} from "@/lib/aiSecurityBlocksDb"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"

// ─────────────────────────────────────────────
// GET – aktive Sperren auflisten
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
      `admin-ai-security-blocks-get:${getRequestIp(request)}`,
      60,
      60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const blocks = await listAiSecurityBlocks()
    return NextResponse.json({ blocks })
  } catch (error) {
    console.error("ai-security-blocks GET failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

// ─────────────────────────────────────────────
// POST – sperren oder freigeben
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
      `admin-ai-security-blocks-post:${getRequestIp(request)}`,
      20,
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
    const action = input.action

    // ── Freigeben ──
    if (action === "unblock") {
      if (typeof input.block_id !== "string" || !input.block_id.trim()) {
        return new NextResponse("block_id fehlt", { status: 400 })
      }
      const ok = await deactivateAiSecurityBlock(input.block_id.trim())

      try {
        await writeAdminAuditLog({
          session,
          action: "ai_block_removed",
          targetType: typeof input.target_type === "string" ? input.target_type : "unknown",
          targetId: typeof input.target_key === "string" ? input.target_key : null,
          targetName: null,
          details: null,
        })
      } catch {
        // Audit-Log-Fehler nicht propagieren
      }

      return NextResponse.json({ ok, tableNotReady: !ok })
    }

    // ── Sperren ──
    if (action === "block") {
      if (!isValidTargetType(input.target_type)) {
        return new NextResponse("Ungültiger target_type (ip | route)", { status: 400 })
      }
      if (typeof input.target_key !== "string" || !input.target_key.trim()) {
        return new NextResponse("target_key fehlt", { status: 400 })
      }
      if (!isValidBlockDuration(input.duration)) {
        return new NextResponse("Ungültige duration (15m | 1h | 24h | permanent)", { status: 400 })
      }
      if (typeof input.block_reason !== "string" || !input.block_reason.trim()) {
        return new NextResponse("block_reason fehlt", { status: 400 })
      }

      // Reason muss aus der definierten Liste kommen oder maximal 200 Zeichen lang sein
      const reason = input.block_reason.trim().slice(0, 200)
      const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : null

      const block = await createAiSecurityBlock({
        target_type: input.target_type,
        target_key: input.target_key.trim(),
        duration: input.duration,
        block_reason: reason,
        created_by: session.accountEmail ?? null,
        note: note || null,
      })

      try {
        await writeAdminAuditLog({
          session,
          action: "ai_block_created",
          targetType: input.target_type,
          targetId: input.target_key.trim(),
          targetName: null,
          details: `Grund: ${reason} | Dauer: ${input.duration}${note ? ` | Notiz: ${note.slice(0, 80)}` : ""}`,
        })
      } catch {
        // Audit-Log-Fehler nicht propagieren
      }

      if (!block) {
        return NextResponse.json({ ok: false, block: null, tableNotReady: true })
      }
      return NextResponse.json({ ok: true, block })
    }

    return new NextResponse("Ungültige Aktion (block | unblock)", { status: 400 })
  } catch (error) {
    console.error("ai-security-blocks POST failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
