import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { isMissingAppErrorsTableError } from "@/lib/appErrorsDb"
import { readAdminNavSeenState } from "@/lib/adminNavSeenDb"

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

/**
 * Freigaben: zählt unapproved members.
 * sinceTs: nur Einträge, die nach diesem Zeitstempel erstellt wurden (= neue seit letztem Seitenbesuch).
 * Ohne sinceTs: alle unapproved zählen (erster Aufruf / noch nie gesehen).
 */
async function countPendingFreigaben(
  supabase: ReturnType<typeof getServerSupabase>,
  sinceTs: string | null,
): Promise<number> {
  try {
    let query = supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("is_approved", false)
    if (sinceTs) query = query.gt("created_at", sinceTs)
    const { count, error } = await query
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

/**
 * Postfach: zählt inbound_emails.
 * sinceTs: nur E-Mails, die nach diesem Zeitstempel eingegangen sind.
 * Ohne sinceTs: alle E-Mails zählen (noch nie gesehen).
 */
async function countPostfachUnread(
  supabase: ReturnType<typeof getServerSupabase>,
  sinceTs: string | null,
): Promise<number> {
  try {
    let query = supabase
      .from("inbound_emails")
      .select("id", { count: "exact", head: true })
    if (sinceTs) query = query.gt("received_at", sinceTs)
    const { count, error } = await query
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

/**
 * Fehler: zählt offene app_errors.
 * sinceTs: nur Fehler, die nach diesem Zeitstempel neu aufgetaucht sind.
 * Ohne sinceTs: alle offenen Fehler zählen (noch nie gesehen).
 */
async function countOffeneAppErrors(
  supabase: ReturnType<typeof getServerSupabase>,
  sinceTs: string | null,
): Promise<number> {
  try {
    let query = supabase
      .from("app_errors")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
    if (sinceTs) query = query.gt("created_at", sinceTs)
    const { count, error } = await query
    if (error) {
      if (isMissingAppErrorsTableError(error)) return 0
      return 0
    }
    return count ?? 0
  } catch {
    return 0
  }
}

/**
 * Sicherheit: zählt high/critical ai_security_events.
 * sinceTs: zählt Ereignisse nach dem letzten Besuch.
 * Ohne sinceTs: Fallback auf die letzten 24 Stunden (ursprüngliches Verhalten).
 */
async function countAiSecurityAlerts(
  supabase: ReturnType<typeof getServerSupabase>,
  sinceTs: string | null,
): Promise<number> {
  try {
    const fallback24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const since = sinceTs ?? fallback24h
    const { count, error } = await supabase
      .from("ai_security_events")
      .select("id", { count: "exact", head: true })
      .in("severity", ["high", "critical"])
      .gt("created_at", since)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

// ─── Response-Typ ─────────────────────────────────────────────────────────────

export type NavBadgesResponse = {
  mitglieder: { total: number; items: { freigaben: number } }
  verwaltung: { total: number; items: { postfach: number } }
  system: { total: number; items: { fehler: number; sicherheit: number } }
}

const EMPTY_BADGES: NavBadgesResponse = {
  mitglieder: { total: 0, items: { freigaben: 0 } },
  verwaltung: { total: 0, items: { postfach: 0 } },
  system: { total: 0, items: { fehler: 0, sicherheit: 0 } },
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json(EMPTY_BADGES, { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return NextResponse.json(EMPTY_BADGES, { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-nav-badges:${getRequestIp(request)}`,
      120,
      10 * 60 * 1000
    )
    if (!rateLimit.ok) {
      return NextResponse.json(EMPTY_BADGES, { status: 429 })
    }

    const supabase = getServerSupabase()
    const seen = await readAdminNavSeenState()

    const [freigaben, postfach, fehler, sicherheit] = await Promise.all([
      countPendingFreigaben(supabase, seen.approvals),
      countPostfachUnread(supabase, seen.mailbox),
      countOffeneAppErrors(supabase, seen.errors),
      countAiSecurityAlerts(supabase, seen.security),
    ])

    const response: NavBadgesResponse = {
      mitglieder: {
        total: freigaben,
        items: { freigaben },
      },
      verwaltung: {
        total: postfach,
        items: { postfach },
      },
      system: {
        total: fehler + sicherheit,
        items: { fehler, sicherheit },
      },
    }

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    // Badges-API darf den Betrieb nie unterbrechen → leere Antwort
    return NextResponse.json(EMPTY_BADGES)
  }
}
