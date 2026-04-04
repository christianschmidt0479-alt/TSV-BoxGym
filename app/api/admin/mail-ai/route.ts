import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { generateAdminMailAiResult } from "@/lib/adminMailAi"

type AdminMailAiBody = {
  mode?: "reply" | "summary"
  subject?: string
  content?: string
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function getAdminMailAiErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "KI-Aktion fehlgeschlagen."
  }

  if (error.message === "OpenAI request timeout") {
    return "Die KI-Antwort hat zu lange gebraucht. Es wurde auf den Fallback gewechselt."
  }

  return "KI-Aktion derzeit nicht verfügbar."
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return jsonError("Forbidden", 403)
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return jsonError("Unauthorized", 401)
    }

    const rateLimit = await checkRateLimitAsync(`admin-mail-ai:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const body = (await request.json()) as AdminMailAiBody
    const mode = body.mode
    const content = body.content?.trim() || ""
    const subject = body.subject?.trim() || ""

    if (mode !== "reply" && mode !== "summary") {
      return jsonError("Ungültiger KI-Modus.", 400)
    }

    if (!content) {
      return jsonError("Kein Mailinhalt übergeben.", 400)
    }

    const result = await generateAdminMailAiResult(mode, { subject, content })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("admin mail ai failed", error)
    return jsonError(getAdminMailAiErrorMessage(error), 500)
  }
}