import { NextResponse } from "next/server"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { formatDateInputForDisplay } from "@/lib/dateFormat"
import { createGsMembershipConfirmationLinks } from "@/lib/gsMembershipConfirmation"
import { getAppBaseUrl } from "@/lib/mailConfig"
import { sendGsMembershipCheckEmail } from "@/lib/resendClient"

type RequestBody = {
  memberId?: string
  firstName?: string
  lastName?: string
  birthdate?: string
  recipientEmail?: string
  subject?: string
  confirmationYesLink?: string
  confirmationNoLink?: string
  confirmationLink?: string
  athleteLabel?: string
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function formatBirthdateForMail(value: string) {
  return formatDateInputForDisplay(value)
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

    const rateLimit = await checkRateLimitAsync(`admin-mail-gs-anfrage:${getRequestIp(request)}`, 20, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    let body: RequestBody | null = null
    try {
      body = (await request.json()) as RequestBody
    } catch {
      body = null
    }

    const firstName = body?.firstName?.trim() ?? ""
    const lastName = body?.lastName?.trim() ?? ""
    const birthdate = body?.birthdate?.trim() ?? ""
    const memberId = body?.memberId?.trim() ?? ""
    const recipientEmail = body?.recipientEmail?.trim() ?? ""
    const subject = body?.subject?.trim() ?? ""
    const confirmationYesLink = body?.confirmationYesLink?.trim() ?? body?.confirmationLink?.trim() ?? ""
    const confirmationNoLink = body?.confirmationNoLink?.trim() ?? ""
    const athleteLabel = body?.athleteLabel?.trim() ?? ""

    if (!firstName || !lastName || !birthdate) {
      return jsonError("Vorname, Nachname und Geburtsdatum sind erforderlich.", 400)
    }

    const birthdateLabel = formatBirthdateForMail(birthdate)
    if (!birthdateLabel) {
      return jsonError("Geburtsdatum ist ungültig.", 400)
    }

    const generatedLinks = memberId
      ? createGsMembershipConfirmationLinks(memberId, getAppBaseUrl())
      : null
    const resolvedConfirmationYesLink = confirmationYesLink || generatedLinks?.yesLink
    const resolvedConfirmationNoLink = confirmationNoLink || generatedLinks?.noLink

    const delivery = await sendGsMembershipCheckEmail({
      firstName,
      lastName,
      birthdateLabel,
      recipientEmail: recipientEmail || undefined,
      subject: subject || undefined,
      confirmationYesLink: resolvedConfirmationYesLink,
      confirmationNoLink: resolvedConfirmationNoLink,
      athleteLabel: athleteLabel || undefined,
    })

    await writeAdminAuditLog({
      session,
      action: "member_gs_request_sent",
      targetType: "member",
      targetName: `${firstName} ${lastName}`.trim(),
      details: `GS-Anfrage gesendet an ${recipientEmail || "gs@tsv-falkensee.de"} für Geburtsdatum ${birthdateLabel}${delivery.messageId ? ` · Resend ${delivery.messageId}` : ""}`,
    })

    return NextResponse.json({
      ok: true,
      delivery,
      confirmationYesLink: resolvedConfirmationYesLink ?? null,
      confirmationNoLink: resolvedConfirmationNoLink ?? null,
    })
  } catch (error) {
    console.error("API ERROR:", error)
    return new Response(JSON.stringify({ error: true, message: "Serverfehler" }), { status: 500 })
  }
}