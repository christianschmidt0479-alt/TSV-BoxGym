import { randomUUID } from "crypto"
import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { hashAuthSecret } from "@/lib/authSecret"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { sendMemberInviteMail } from "@/lib/mail/memberInviteMail"

function generateMemberQrToken() {
  return randomBytes(16).toString("hex")
}

const INVITE_EXPIRY_DAYS = 7

type CreateMemberInviteBody = {
  firstName?: unknown
  lastName?: unknown
  email?: unknown
  birthdate?: unknown
  phone?: unknown
  baseGroup?: unknown
}

function sanitizeStr(value: unknown, maxLen = 200): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLen)
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

    const rateLimit = await checkRateLimitAsync(
      `admin-excel-create-member:${getRequestIp(request)}`,
      20,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    let body: CreateMemberInviteBody
    try {
      body = (await request.json()) as CreateMemberInviteBody
    } catch {
      return NextResponse.json({ ok: false, error: "Ungültige Anfrage." }, { status: 400 })
    }

    const firstName = sanitizeStr(body.firstName, 100)
    const lastName = sanitizeStr(body.lastName, 100)
    const email = sanitizeStr(body.email, 254).toLowerCase()
    const birthdate = sanitizeStr(body.birthdate, 20)
    const phone = sanitizeStr(body.phone, 50)
    const baseGroup = sanitizeStr(body.baseGroup, 100)

    if (!firstName || !lastName) {
      return NextResponse.json({ ok: false, error: "Vor- und Nachname sind erforderlich." }, { status: 400 })
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "Gültige E-Mail-Adresse ist erforderlich." }, { status: 400 })
    }
    if (!birthdate) {
      return NextResponse.json({ ok: false, error: "Geburtsdatum ist erforderlich." }, { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()

    // Check if member with this email already exists
    const { data: existing, error: lookupErr } = await supabase
      .from("members")
      .select("id, email_verified, member_pin")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lookupErr) {
      console.error("admin-create-member lookup error", lookupErr)
      return NextResponse.json({ ok: false, error: "Datenbankfehler beim Mitglieder-Lookup." }, { status: 500 })
    }

    // If member exists and already has a verified account with password → block
    if (
      existing &&
      existing.email_verified &&
      typeof existing.member_pin === "string" &&
      existing.member_pin.length > 0
    ) {
      return NextResponse.json(
        { ok: false, error: "Für diese E-Mail-Adresse besteht bereits ein aktiver Zugang.", code: "account_exists" },
        { status: 409 },
      )
    }

    const token = randomUUID()
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

    let memberId: string

    if (existing) {
      // Update existing unverified member with new invite token
      const updates: Record<string, unknown> = {
        email_verification_token: token,
        email_verification_expires_at: expiresAt,
        email_verified: false,
        email_verified_at: null,
        is_approved: true,
        first_name: firstName,
        last_name: lastName,
        birthdate,
      }
      if (phone) updates.phone = phone
      if (baseGroup) updates.base_group = baseGroup

      const { error: updateErr } = await supabase.from("members").update(updates).eq("id", existing.id)
      if (updateErr) {
        console.error("admin-create-member update error", updateErr)
        return NextResponse.json({ ok: false, error: "Mitglied konnte nicht aktualisiert werden." }, { status: 500 })
      }
      memberId = existing.id
    } else {
      // Create new member without password (member sets it via invite link)
      // member_pin is set as a placeholder hash that can never be guessed, so
      // login is only possible after the member sets their password via the invite flow.
      const placeholderPin = await hashAuthSecret(randomUUID())

      const insertPayload: Record<string, unknown> = {
        first_name: firstName,
        last_name: lastName,
        email,
        birthdate,
        name: `${firstName} ${lastName}`.trim(),
        is_trial: false,
        is_approved: true,
        email_verified: false,
        email_verified_at: null,
        email_verification_token: token,
        email_verification_expires_at: expiresAt,
        member_pin: placeholderPin,
        member_qr_token: generateMemberQrToken(),
        member_qr_active: false,
      }
      if (phone) insertPayload.phone = phone
      if (baseGroup) insertPayload.base_group = baseGroup

      const { data: inserted, error: insertErr } = await supabase
        .from("members")
        .insert(insertPayload)
        .select("id")
        .single()

      if (insertErr || !inserted?.id) {
        console.error("admin-create-member insert error", insertErr)
        return NextResponse.json({ ok: false, error: "Mitglied konnte nicht angelegt werden." }, { status: 500 })
      }
      memberId = inserted.id
    }

    // Send invite mail
    let mailSent = false
    try {
      await sendMemberInviteMail({ email, firstName, token })
      mailSent = true
    } catch (mailErr) {
      console.error("admin-create-member mail error", mailErr)
      // Mail failure is non-fatal: member exists, admin can retry
    }

    return NextResponse.json({
      ok: true,
      memberId,
      created: !existing,
      mailSent,
    })
  } catch (error) {
    console.error("admin excel create member error", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
