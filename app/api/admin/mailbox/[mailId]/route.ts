import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getAdminMailboxRecord, updateAdminMailboxRecord } from "@/lib/adminMailboxDb"
import type { AdminMailboxStatus, AdminMailboxType } from "@/lib/adminMailbox"

type UpdateMailboxBody = {
  from?: string
  to?: string
  subject?: string
  content?: string
  status?: AdminMailboxStatus
  type?: AdminMailboxType
}

const ALLOWED_STATUS = new Set<AdminMailboxStatus>(["open", "draft", "done", "sent"])
const ALLOWED_TYPE = new Set<AdminMailboxType>(["inbox", "draft"])

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

async function requireAdmin(request: Request) {
  if (!isAllowedOrigin(request)) {
    return jsonError("Forbidden", 403)
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session || session.accountRole !== "admin") {
    return jsonError("Unauthorized", 401)
  }

  return null
}

export async function GET(request: Request, context: { params: Promise<{ mailId: string }> }) {
  try {
    const authError = await requireAdmin(request)
    if (authError) return authError

    const rateLimit = await checkRateLimitAsync(`admin-mailbox-detail:${getRequestIp(request)}`, 120, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const { mailId } = await context.params
    const record = await getAdminMailboxRecord(mailId)
    if (!record) {
      return jsonError("Mailbox-Eintrag nicht gefunden.", 404)
    }

    return NextResponse.json({ ok: true, record })
  } catch (error) {
    console.error("admin mailbox detail failed", error)
    return jsonError(error instanceof Error ? error.message : "Mailbox-Detail konnte nicht geladen werden.", 500)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ mailId: string }> }) {
  try {
    const authError = await requireAdmin(request)
    if (authError) return authError

    const rateLimit = await checkRateLimitAsync(`admin-mailbox-update:${getRequestIp(request)}`, 90, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const { mailId } = await context.params
    const body = (await request.json()) as UpdateMailboxBody

    if (body.status && !ALLOWED_STATUS.has(body.status)) {
      return jsonError("Ungültiger Status.", 400)
    }

    if (body.type && !ALLOWED_TYPE.has(body.type)) {
      return jsonError("Ungültiger Typ.", 400)
    }

    const record = await updateAdminMailboxRecord(mailId, {
      from: typeof body.from === "string" ? body.from : undefined,
      to: typeof body.to === "string" ? body.to : undefined,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      content: typeof body.content === "string" ? body.content : undefined,
      status: body.status,
      type: body.type,
    })

    return NextResponse.json({ ok: true, record })
  } catch (error) {
    console.error("admin mailbox update failed", error)
    return jsonError(error instanceof Error ? error.message : "Mailbox-Eintrag konnte nicht gespeichert werden.", 500)
  }
}