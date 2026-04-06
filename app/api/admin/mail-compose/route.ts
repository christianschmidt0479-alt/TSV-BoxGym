import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { buildAdminMailDraftPreview, type AdminMailDraftRequest } from "@/lib/adminMailComposer"
import { validateEmail } from "@/lib/formValidation"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { markManualAdminMailDraftSent } from "@/lib/manualAdminMailOutboxDb"
import { sendCustomEmail } from "@/lib/resendClient"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { reportAppError } from "@/lib/appErrorReporter"

type PreviewBody = {
  requests?: AdminMailDraftRequest[]
}

type SendBody = {
  drafts?: Array<{
    request: AdminMailDraftRequest
    to?: string
    subject?: string
    body?: string
  }>
  sourceQueueIds?: string[]
}

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

async function resolveDraftRequest(request: AdminMailDraftRequest) {
  if (request.kind !== "verification_member") {
    return request
  }

  const supabase = createServerSupabaseServiceClient()
  const { data: member, error } = await supabase
    .from("members")
    .select("id, email_verification_token")
    .eq("id", request.memberId)
    .single()

  if (error) throw error
  if (!member) {
    throw new Error("Mitglied für Bestätigungs-Mail nicht gefunden.")
  }

  const verificationToken = member.email_verification_token || randomUUID()

  if (!member.email_verification_token) {
    const { error: tokenError } = await supabase
      .from("members")
      .update({ email_verification_token: verificationToken })
      .eq("id", request.memberId)

    if (tokenError) throw tokenError
  }

  const verificationBaseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
  return {
    kind: "verification",
    email: request.email,
    name: request.name,
    targetKind: request.targetKind,
    link: `${verificationBaseUrl}/mein-bereich?verify=${verificationToken}`,
  } satisfies AdminMailDraftRequest
}

export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin(request)
    if (error) return error
    const requestBaseUrl = new URL(request.url).origin

    const rateLimit = await checkRateLimitAsync(`admin-mail-compose-preview:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const body = (await request.json()) as PreviewBody
    const requests = Array.isArray(body.requests) ? body.requests : []

    if (requests.length === 0) {
      return jsonError("Keine Mail-Entwürfe angefordert.", 400)
    }

    const resolvedRequests = await Promise.all(requests.map((entry) => resolveDraftRequest(entry)))
    const drafts = await Promise.all(
      resolvedRequests.map((entry) => buildAdminMailDraftPreview(entry, { baseUrl: requestBaseUrl }))
    )
    return NextResponse.json({ ok: true, drafts })
  } catch (error) {
    console.error("admin mail compose preview failed", error)
    return jsonError(error instanceof Error ? error.message : "Entwurf konnte nicht geladen werden.", 500)
  }
}

export async function PUT(request: Request) {
  try {
    const { error, session } = await requireAdmin(request)
    if (error || !session) return error

    const rateLimit = await checkRateLimitAsync(`admin-mail-compose-send:${getRequestIp(request)}`, 20, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const body = (await request.json()) as SendBody
    const drafts = Array.isArray(body.drafts) ? body.drafts : []

    if (drafts.length === 0) {
      return jsonError("Keine Mail zum Senden übergeben.", 400)
    }

    const deliveries = []

    for (const draft of drafts) {
      const resolvedRequest = await resolveDraftRequest(draft.request)
      const preview = await buildAdminMailDraftPreview(resolvedRequest, { generateDynamicLinks: false })
      const to = draft.to?.trim().toLowerCase() || preview.to
      const subject = draft.subject?.trim() || preview.subject
      const mailBody = draft.body?.trim() || preview.body

      if (!to || !subject || !mailBody) {
        return jsonError("Empfänger, Betreff und Inhalt sind erforderlich.", 400)
      }

      const emailValidation = validateEmail(to)
      if (!emailValidation.valid) {
        return jsonError(emailValidation.error || "Ungültige E-Mail-Adresse.", 400)
      }

      const delivery = await sendCustomEmail({
        to,
        subject,
        text: mailBody,
        replyTo: preview.replyTo,
      })

      await writeAdminAuditLog({
        session,
        action: preview.auditAction,
        targetType: preview.auditTargetType,
        targetName: preview.auditTargetName,
        details: `${preview.auditDetailsPrefix}${delivery.messageId ? ` · Resend ${delivery.messageId}` : ""}${to !== preview.to ? ` · final an ${to}` : ""}`,
      })

      deliveries.push({
        kind: preview.kind,
        to,
        subject,
        successMessage: preview.successMessage,
        delivery,
      })
    }

    const sourceQueueIds = Array.isArray(body.sourceQueueIds) ? body.sourceQueueIds : []
    for (const queueId of sourceQueueIds) {
      if (typeof queueId === "string" && queueId.trim()) {
        await markManualAdminMailDraftSent(queueId.trim())
      }
    }

    return NextResponse.json({ ok: true, deliveries })
  } catch (error) {
    console.error("admin mail compose send failed", error)
    void reportAppError("mail", "send_failed", "high", error, { route: "/api/admin/mail-compose" })
    return jsonError(error instanceof Error ? error.message : "Mail konnte nicht versendet werden.", 500)
  }
}
