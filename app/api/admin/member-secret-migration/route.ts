import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { isBcryptHash, isSha256Hex } from "@/lib/authSecret"
import { POST as requestMemberPasswordReset } from "@/app/api/public/member-password-reset/route"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type MigrationCategory = "bcrypt_hash" | "sha256_legacy_hash" | "possible_plaintext_legacy" | "missing_secret"

type MigrationCounts = Record<MigrationCategory, number>

type AffectedMemberCategory = "possible_plaintext_legacy" | "missing_secret"

type AffectedMember = {
  id: string
  name: string | null
  email: string | null
  base_group: string | null
  created_at: string | null
  category: AffectedMemberCategory
  recommendedAction: string
}

type MemberSecretMigrationActionBody = {
  action: "send_password_reset"
  memberId: string
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function classifyMemberSecret(value: unknown): MigrationCategory {
  if (typeof value !== "string") return "missing_secret"

  const normalized = value.trim()
  if (!normalized) return "missing_secret"
  if (isBcryptHash(normalized)) return "bcrypt_hash"
  if (isSha256Hex(normalized)) return "sha256_legacy_hash"
  return "possible_plaintext_legacy"
}

function recommendedActionForCategory(category: AffectedMemberCategory) {
  if (category === "missing_secret") {
    return "Passwort-Reset senden / Zugang neu einrichten"
  }

  return "Beim naechsten Login wird automatisch auf bcrypt aktualisiert oder Reset empfehlen"
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

    const rateLimit = await checkRateLimitAsync(`admin-member-secret-migration:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    const includeAffectedMembers = new URL(request.url).searchParams.get("includeAffectedMembers") === "1"

    const supabase = createServerSupabaseServiceClient()
    const { data, error } = await supabase
      .from("members")
      .select("id, name, email, base_group, created_at, member_pin")
      .order("created_at", { ascending: true })
    if (error) throw error

    const counts: MigrationCounts = {
      bcrypt_hash: 0,
      sha256_legacy_hash: 0,
      possible_plaintext_legacy: 0,
      missing_secret: 0,
    }

    const rows = Array.isArray(data) ? data : []
    const affectedMembers: AffectedMember[] = []

    for (const row of rows as Array<{
      id?: unknown
      name?: unknown
      email?: unknown
      base_group?: unknown
      created_at?: unknown
      member_pin?: unknown
    }>) {
      const category = classifyMemberSecret(row.member_pin)
      counts[category] += 1

      if (includeAffectedMembers && (category === "missing_secret" || category === "possible_plaintext_legacy")) {
        affectedMembers.push({
          id: typeof row.id === "string" ? row.id : "",
          name: typeof row.name === "string" ? row.name : null,
          email: typeof row.email === "string" ? row.email : null,
          base_group: typeof row.base_group === "string" ? row.base_group : null,
          created_at: typeof row.created_at === "string" ? row.created_at : null,
          category,
          recommendedAction: recommendedActionForCategory(category),
        })
      }
    }

    return NextResponse.json({
      totalMembers: rows.length,
      categories: counts,
      hasPossiblePlaintextLegacy: counts.possible_plaintext_legacy > 0,
      affectedMembersTotal: counts.possible_plaintext_legacy + counts.missing_secret,
      ...(includeAffectedMembers ? { affectedMembers } : {}),
      notice: "Keine Passwoerter oder PINs werden angezeigt.",
    })
  } catch (error) {
    console.error("admin member secret migration failed", error)
    return jsonError("Internal server error", 500)
  }
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

    const rateLimit = await checkRateLimitAsync(`admin-member-secret-migration-action:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return jsonError("Too many requests", 429)
    }

    let body: MemberSecretMigrationActionBody | null = null
    try {
      body = (await request.json()) as MemberSecretMigrationActionBody
    } catch {
      body = null
    }

    if (!body || body.action !== "send_password_reset" || typeof body.memberId !== "string" || !body.memberId.trim()) {
      return jsonError("Invalid request body", 400)
    }

    const supabase = createServerSupabaseServiceClient()
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, email")
      .eq("id", body.memberId)
      .maybeSingle()

    if (memberError) throw memberError

    // Neutral response to avoid exposing account state details.
    if (!member || typeof member.email !== "string" || !member.email.trim()) {
      return NextResponse.json({
        ok: true,
        message: "Wenn ein passendes Mitglied mit bestaetigter E-Mail existiert, wurde ein Reset-Link versendet.",
      })
    }

    const origin = request.headers.get("origin") || new URL(request.url).origin
    const proxyRequest = new Request(new URL("/api/public/member-password-reset", request.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({ action: "request", email: member.email.trim().toLowerCase() }),
    })

    await requestMemberPasswordReset(proxyRequest)

    return NextResponse.json({
      ok: true,
      message: "Wenn ein passendes Mitglied mit bestaetigter E-Mail existiert, wurde ein Reset-Link versendet.",
    })
  } catch (error) {
    console.error("admin member secret migration action failed", error)
    return jsonError("Internal server error", 500)
  }
}
