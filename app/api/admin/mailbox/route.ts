import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createAdminMailboxDraftFromInbound, createAdminMailboxReplyDraft, listAdminMailboxRecords } from "@/lib/adminMailboxDb"

type MailboxActionBody =
  | { action: "reply"; sourceId: string }
  | { action: "inbound_reply"; fromEmail: string; subject: string; text: string }

const INBOX_HIDDEN_STATUSES = new Set(["done", "deleted"])

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

async function requireAdmin(request: Request) {
  if (!isAllowedOrigin(request)) {
    return { error: jsonError("Forbidden", 403), session: null }
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session || session.accountRole !== "admin") {
    return { error: jsonError("Unauthorized", 401), session: null }
  }

  return { error: null, session }
}

export async function GET(request: Request) {
  try {
    const { error } = await requireAdmin(request)
    if (error) return error

    const rateLimit = await checkRateLimitAsync(`admin-mailbox-list:${getRequestIp(request)}`, 120, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const records = await listAdminMailboxRecords()
    return NextResponse.json({
      ok: true,
      inbox: records.filter((row) => row.type === "inbox" && !INBOX_HIDDEN_STATUSES.has(String(row.status))),
      drafts: records.filter((row) => row.type === "draft" && String(row.status) === "draft"),
      deleted: records.filter((row) => String(row.status) === "deleted"),
    })
  } catch (error) {
    console.error("admin mailbox list failed", error)
    return jsonError(error instanceof Error ? error.message : "Postfach konnte nicht geladen werden.", 500)
  }
}

export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin(request)
    if (error) return error

    const rateLimit = await checkRateLimitAsync(`admin-mailbox-action:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const body = (await request.json()) as MailboxActionBody

    if (body.action === "reply") {
      if (!body.sourceId?.trim()) {
        return jsonError("Ungültige Mailbox-Aktion.", 400)
      }
      const draft = await createAdminMailboxReplyDraft(body.sourceId.trim())
      return NextResponse.json({ ok: true, draft })
    }

    if (body.action === "inbound_reply") {
      if (!body.fromEmail?.trim()) {
        return jsonError("Ungültige Mailbox-Aktion.", 400)
      }
      const draft = await createAdminMailboxDraftFromInbound({
        fromEmail: body.fromEmail.trim(),
        subject: body.subject ?? "",
        text: body.text ?? "",
      })
      return NextResponse.json({ ok: true, draft })
    }

    return jsonError("Ungültige Mailbox-Aktion.", 400)
  } catch (error) {
    console.error("admin mailbox action failed", error)
    return jsonError(error instanceof Error ? error.message : "Mailbox-Aktion fehlgeschlagen.", 500)
  }
}