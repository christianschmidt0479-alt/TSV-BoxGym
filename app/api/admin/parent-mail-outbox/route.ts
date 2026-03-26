import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getAppBaseUrl } from "@/lib/mailConfig"
import { getManualParentMailDrafts, upsertManualParentMailDraft } from "@/lib/manualParentMailOutboxDb"
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

    const rateLimit = checkRateLimit(`admin-parent-mail-outbox:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const rows = await getManualParentMailDrafts()
    return NextResponse.json({ rows })
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

    const rateLimit = checkRateLimit(`admin-parent-mail-outbox-post:${getRequestIp(request)}`, 20, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const parentFamilyRows = await getParentFamilyMailRows()
    const appBaseUrl = getAppBaseUrl()

    const drafts = await Promise.all(
      parentFamilyRows.map((row) =>
        upsertManualParentMailDraft({
          parentAccountId: row.parent_account_id,
          parentName: row.parent_name,
          parentEmail: row.parent_email,
          parentPhone: row.parent_phone,
          subject: getParentFamilySubject(row),
          body: getParentFamilyBody(row, appBaseUrl),
          link: getParentFamilyLink(row, appBaseUrl),
          children: row.children,
        })
      )
    )

    return NextResponse.json({
      ok: true,
      queued: drafts.length,
      rows: drafts,
    })
  } catch (error) {
    console.error("queue parent mails failed", error)
    return new NextResponse(error instanceof Error ? error.message : "Internal server error", { status: 500 })
  }
}
