import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { sendAdminMailboxDraft } from "@/lib/adminMailboxDb"

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function getAdminMailboxSendErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Entwurf konnte nicht gesendet werden."
  }

  if (error.message === "Missing RESEND_API_KEY") {
    return "Mailversand ist noch nicht konfiguriert."
  }

  if (error.message.includes("Ungültige E-Mail-Adresse")) {
    return "Die Empfängeradresse ist ungültig."
  }

  if (
    error.message.includes("Invalid `from` field") ||
    error.message.includes("Missing `from` field") ||
    error.message.toLowerCase().includes("reply_to")
  ) {
    return "Die Absenderkonfiguration für den Mailversand ist ungültig."
  }

  return "Mailversand derzeit nicht verfügbar."
}

export async function POST(request: Request, context: { params: Promise<{ mailId: string }> }) {
  try {
    if (!isAllowedOrigin(request)) {
      return jsonError("Forbidden", 403)
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return jsonError("Unauthorized", 401)
    }

    const rateLimit = await checkRateLimitAsync(`admin-mailbox-send:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const { mailId } = await context.params
    const result = await sendAdminMailboxDraft({ id: mailId, session })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("admin mailbox send failed", error)
    return jsonError(getAdminMailboxSendErrorMessage(error), 500)
  }
}