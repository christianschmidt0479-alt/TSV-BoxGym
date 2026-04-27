import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { buildAdminMailDraftPreview, type AdminMailDraftRequest } from "@/lib/adminMailComposer"
import { upsertManualAdminMailDraft } from "@/lib/manualAdminMailOutboxDb"

type ManualMailOutboxBody = {
  request?: AdminMailDraftRequest
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-manual-mail-outbox:${getRequestIp(request)}`, 40, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as ManualMailOutboxBody
    const draftRequest = body.request

    if (!draftRequest || draftRequest.kind !== "approval_notice") {
      return new NextResponse("Nur Freigabe-Mails können im manuellen Postausgang gespeichert werden.", { status: 400 })
    }

    const preview = await buildAdminMailDraftPreview(draftRequest)
    const draft = await upsertManualAdminMailDraft({
      to: preview.to,
      name: draftRequest.name ?? null,
      subject: preview.subject,
      body: preview.body,
      request: draftRequest,
    })

    return NextResponse.json({ ok: true, draft })
  } catch (error) {
    console.error("admin manual mail outbox failed", error)
    return NextResponse.json({ ok: false, error: "Serverfehler" }, { status: 500 })
  }
}