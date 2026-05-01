import { NextResponse } from "next/server"

/**
 * POST /api/checkin/member
 * 
 * LEGACY FORWARD ENDPOINT — Routes all requests to /api/public/member-checkin
 * Legacy fallback only; internal consumers use /api/public/member-checkin.
 * 
 * This endpoint is maintained for backward compatibility with:
 * - external clients not yet migrated
 * - legacy scripts or integrations outside this repository
 * 
 * All actual logic is unified in /api/public/member-checkin.
 * This route simply logs usage and forwards the request.
 * 
 * Request body supports:
 * - { source: "trainer", memberId: "..." } → Trainer check-in
 * - { email: "...", pin: "..." } → Member check-in
 * - { email: "...", password: "..." } → Member check-in (alt)
 * 
 * Trainer session cookie is automatically forwarded with the request.
 */
export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV !== "production") {
      console.warn('[checkin][legacy_endpoint_used] /api/checkin/member → forwarding to /api/public/member-checkin')
    }

    // Parse request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    // Build absolute URL for internal fetch
    const origin = request.headers.get("x-forwarded-proto") === "https"
      ? `https://${request.headers.get("x-forwarded-host") || request.headers.get("host")}`
      : `http://${request.headers.get("host") || "localhost:3000"}`

    // Forward the request to the unified endpoint with absolute URL
    const forwardUrl = new URL("/api/public/member-checkin", origin)

    // Build headers, including cookies for trainer session validation
    const forwardHeaders = new Headers({
      "Content-Type": "application/json",
    })
    
    const cookieHeader = request.headers.get("cookie")
    if (cookieHeader) {
      forwardHeaders.set("cookie", cookieHeader)
    }

    const response = await fetch(forwardUrl.toString(), {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(body),
    })

    // Parse and return the forwarded response
    const responseBody = await response.json()

    return NextResponse.json(responseBody, { status: response.status })
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[checkin][legacy_endpoint] forward error:", error)
    }
    return NextResponse.json(
      { ok: false, error: "Check-in fehlgeschlagen" },
      { status: 500 }
    )
  }
}
