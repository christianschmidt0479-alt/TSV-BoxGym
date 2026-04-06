import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminNavSeenSection, type AdminNavSeenSection } from "@/lib/adminNavSeenDb"

const VALID_SECTIONS: AdminNavSeenSection[] = ["mailbox", "errors", "security", "approvals"]

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ ok: false }, { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-nav-seen:${getRequestIp(request)}`,
      60,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return NextResponse.json({ ok: false }, { status: 429 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    if (!body || typeof body !== "object" || !("section" in body)) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const section = (body as { section: unknown }).section
    if (typeof section !== "string" || !(VALID_SECTIONS as string[]).includes(section)) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    await writeAdminNavSeenSection(section as AdminNavSeenSection)
    return NextResponse.json({ ok: true })
  } catch {
    // Defensiv: nie abstürzen
    return NextResponse.json({ ok: false })
  }
}
