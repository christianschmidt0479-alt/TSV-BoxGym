import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { fetchAndStoreNewMails } from "@/lib/imapIngest"

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

export async function POST(request: Request) {
  try {
    const authError = await requireAdmin(request)
    if (authError) return authError

    const rateLimit = await checkRateLimitAsync(`admin-imap-sync:${getRequestIp(request)}`, 10, 5 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Bitte warte kurz bevor du erneut abrufst.", 429)
    }

    const result = await fetchAndStoreNewMails()
    return NextResponse.json({ ok: true, imported: result.imported, skipped: result.skipped })
  } catch (error) {
    console.error("[admin/inbound-emails/sync] Error", error)
    return jsonError("Abruf fehlgeschlagen.", 500)
  }
}

export function GET() {
  return jsonError("Method not allowed", 405)
}
