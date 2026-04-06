import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import {
  listAppErrors,
  getAppErrorOverview,
  updateAppErrorStatus,
  type AppErrorStatus,
  type AppErrorSeverity,
} from "@/lib/appErrorsDb"
import { buildAppErrorSummaryText } from "@/lib/appErrorAnalysis"

const VALID_RANGES = ["24h", "7d", "30d"] as const
const VALID_STATUSES: AppErrorStatus[] = ["open", "acknowledged", "resolved", "ignored"]
const VALID_SEVERITIES: AppErrorSeverity[] = ["low", "medium", "high", "critical"]

// GET — liest Fehlerübersicht + Liste
export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-app-errors-get:${getRequestIp(request)}`,
      60,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const url = new URL(request.url)
    const rawRange = url.searchParams.get("range") ?? "7d"
    const range = VALID_RANGES.includes(rawRange as (typeof VALID_RANGES)[number])
      ? (rawRange as (typeof VALID_RANGES)[number])
      : "7d"

    const rawStatus = url.searchParams.get("status") ?? ""
    const status = VALID_STATUSES.includes(rawStatus as AppErrorStatus)
      ? (rawStatus as AppErrorStatus)
      : null

    const rawSeverity = url.searchParams.get("severity") ?? ""
    const severity = VALID_SEVERITIES.includes(rawSeverity as AppErrorSeverity)
      ? (rawSeverity as AppErrorSeverity)
      : null

    const q = url.searchParams.get("q")?.trim().slice(0, 100) || null

    const [errors, overview] = await Promise.all([
      listAppErrors({ range, status, severity, q }),
      getAppErrorOverview(range),
    ])

    const summaryText = buildAppErrorSummaryText(errors, overview)

    return NextResponse.json({ errors, overview, summaryText })
  } catch (err) {
    console.error("[admin/app-errors GET] failed:", err)
    return new NextResponse("Internal server error", { status: 500 })
  }
}

// PATCH — Status und Notiz eines Eintrags aktualisieren
export async function PATCH(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-app-errors-patch:${getRequestIp(request)}`,
      20,
      60 * 1000
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new NextResponse("Invalid JSON", { status: 400 })
    }

    if (!body || typeof body !== "object") {
      return new NextResponse("Invalid body", { status: 400 })
    }

    const { id, status: rawStatus, note: rawNote } = body as Record<string, unknown>

    if (typeof id !== "string" || !id.trim()) {
      return new NextResponse("Missing id", { status: 400 })
    }

    if (!VALID_STATUSES.includes(rawStatus as AppErrorStatus)) {
      return new NextResponse("Invalid status", { status: 400 })
    }

    const note = typeof rawNote === "string" ? rawNote.slice(0, 1000) : undefined

    const updated = await updateAppErrorStatus(id.trim(), rawStatus as AppErrorStatus, note)

    if (!updated) {
      return new NextResponse("Not found or update failed", { status: 404 })
    }

    return NextResponse.json({ ok: true, record: updated })
  } catch (err) {
    console.error("[admin/app-errors PATCH] failed:", err)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
