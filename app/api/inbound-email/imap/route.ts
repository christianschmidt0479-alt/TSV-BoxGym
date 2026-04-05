import { NextResponse } from "next/server"
import { fetchAndStoreNewMails } from "@/lib/imapIngest"

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // --- Auth-Check ---
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("IMAP ERROR: CRON_SECRET not configured")
    return jsonError("Service not configured", 503)
  }

  const auth = request.headers.get("authorization")
  if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== cronSecret) {
    console.warn("IMAP ERROR: Unauthorized request rejected")
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // --- Import ---
  console.log("IMAP START")
  try {
    const result = await fetchAndStoreNewMails()
    console.log("IMPORTED:", result.imported)
    if (result.imported === 0 && result.skipped === 0) {
      return NextResponse.json({ ok: true, processed: 0 })
    }
    return NextResponse.json({ ok: true, processed: result.imported, checked: true })
  } catch (error) {
    console.error("IMAP ERROR", error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export function GET() {
  return jsonError("Method not allowed", 405)
}

export function PUT() {
  return jsonError("Method not allowed", 405)
}

export function PATCH() {
  return jsonError("Method not allowed", 405)
}

export function DELETE() {
  return jsonError("Method not allowed", 405)
}
