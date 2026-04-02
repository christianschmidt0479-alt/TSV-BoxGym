import { NextResponse } from "next/server"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { sendGsMembershipCheckEmail } from "@/lib/resendClient"

type RequestBody = {
  firstName?: string
  lastName?: string
  birthdate?: string
  recipientEmail?: string
  subject?: string
  confirmationLink?: string
  athleteLabel?: string
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function formatBirthdateForMail(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmedValue)) {
    return trimmedValue
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    const [year, month, day] = trimmedValue.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))

    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null
    }

    return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(date)
  }

  const parsed = new Date(trimmedValue)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(parsed)
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
    const recipientEmail = body?.recipientEmail?.trim() ?? ""
    const subject = body?.subject?.trim() ?? ""
    const confirmationLink = body?.confirmationLink?.trim() ?? ""
    const athleteLabel = body?.athleteLabel?.trim() ?? ""

    if (!firstName || !lastName || !birthdate) {
      return jsonError("Vorname, Nachname und Geburtsdatum sind erforderlich.", 400)
    }

    const birthdateLabel = formatBirthdateForMail(birthdate)
    if (!birthdateLabel) {
      return jsonError("Geburtsdatum ist ungültig.", 400)
    }

    const delivery = await sendGsMembershipCheckEmail({
      firstName,
      lastName,
      birthdateLabel,
      recipientEmail: recipientEmail || undefined,
      subject: subject || undefined,
      confirmationLink: confirmationLink || undefined,
      athleteLabel: athleteLabel || undefined,
    })

    await writeAdminAuditLog({
      session,
      action: "member_gs_request_sent",
      targetType: "member",
      targetName: `${firstName} ${lastName}`.trim(),
      details: `GS-Anfrage gesendet an ${recipientEmail || "gs@tsv-falkensee.de"} fuer Geburtsdatum ${birthdateLabel}${delivery.messageId ? ` · Resend ${delivery.messageId}` : ""}`,
    })

    return NextResponse.json({ ok: true, delivery })
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : "GS-Anfrage konnte nicht versendet werden."
    return jsonError(message || "GS-Anfrage konnte nicht versendet werden.", 500)
  }
}