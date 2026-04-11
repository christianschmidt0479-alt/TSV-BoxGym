import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { getAppBaseUrl } from "@/lib/mailConfig"
import { getParentFamilyBody, getParentFamilyLink, getParentFamilyMailRows, getParentFamilySubject } from "@/lib/parentMailDrafts"

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-parent-mail-outbox:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    // Eltern-Mail-Outbox-Logik entfernt
  } catch (error) {
    console.error("admin parent mail outbox failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
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

    const rateLimit = await checkRateLimitAsync(`admin-parent-mail-outbox-post:${getRequestIp(request)}`, 20, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const parentFamilyRows = await getParentFamilyMailRows()
    const appBaseUrl = getAppBaseUrl()

    // Eltern-Mail-Outbox-Logik entfernt
    const drafts: any[] = []

    await writeAdminAuditLog({
      session,
      action: "parent_mail_drafts_refreshed",
      targetType: "parent_mail_outbox",
      details: `${drafts.length} Entwuerfe aktualisiert`,
    })

    return NextResponse.json({
      ok: true,
      queued: drafts.length,
      rows: drafts,
    })
  } catch (error) {
    console.error("queue parent mails failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
