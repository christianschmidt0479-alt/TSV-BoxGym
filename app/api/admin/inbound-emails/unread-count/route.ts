import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return jsonError("Forbidden", 403)
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return jsonError("Unauthorized", 401)
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-inbound-emails-count:${getRequestIp(request)}`,
      120,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const { searchParams } = new URL(request.url)
    const since = searchParams.get("since")

    let supabase = null;
    try {
      supabase = createServerSupabaseServiceClient();
    } catch (e) {
      console.error("[admin/inbound-emails/unread-count] Supabase client error", e);
      // Service unavailable, aber kein 500 für UI
      return NextResponse.json({ ok: false, count: 0, error: "Service unavailable" }, { status: 200 });
    }

    let query = supabase
      .from("inbound_emails")
      .select("id", { count: "exact", head: true });

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        query = query.gt("received_at", sinceDate.toISOString());
      } else {
        // Ungültiges Datum: defensiv ignorieren
        console.warn("[admin/inbound-emails/unread-count] Invalid since param", since);
      }
    }

    let count = 0;
    try {
      const result = await query;
      if (result.error) {
        console.error("[admin/inbound-emails/unread-count] DB query failed", result.error);
        return NextResponse.json({ ok: false, count: 0, error: "DB error" }, { status: 200 });
      }
      count = result.count ?? 0;
    } catch (e) {
      console.error("[admin/inbound-emails/unread-count] Query exception", e);
      return NextResponse.json({ ok: false, count: 0, error: "Query exception" }, { status: 200 });
    }

    return NextResponse.json({ ok: true, count });
  } catch (error) {
    console.error("[admin/inbound-emails/unread-count] Unexpected error", error);
    return NextResponse.json({ ok: false, count: 0, error: "Unexpected error" }, { status: 200 });
  }
}
