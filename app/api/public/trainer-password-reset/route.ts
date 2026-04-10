import { createHash, randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin, sanitizeTextInput } from "@/lib/apiSecurity"
import { hashTrainerPin, isTrainerPinCompliant } from "@/lib/trainerPin"
import { findTrainerByEmail, updateTrainerAccountPin } from "@/lib/trainerDb"
import { getAppBaseUrl, DEFAULT_APP_BASE_URL } from "@/lib/mailConfig"
import { sendCustomEmail } from "@/lib/resendClient"

const TRAINER_PASSWORD_RESET_WINDOW_MS = 30 * 60 * 1000

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function isExpiredReset(trainer: any) {
  if (!trainer?.password_reset_expires_at) return true
  return new Date(trainer.password_reset_expires_at).getTime() < Date.now()
}

async function storeResetToken(trainerId: string, tokenHash: string, expiresAt: string) {
  // Minimal update
  const supabase = (await import("@/lib/serverSupabase")).createServerSupabaseServiceClient()
  const response = await supabase
    .from("trainer_accounts")
    .update({
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: expiresAt,
    })
    .eq("id", trainerId)
  if (response.error) throw response.error
}

async function clearResetToken(trainerId: string) {
  const supabase = (await import("@/lib/serverSupabase")).createServerSupabaseServiceClient()
  const response = await supabase
    .from("trainer_accounts")
    .update({
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    })
    .eq("id", trainerId)
  if (response.error) throw response.error
}

async function readResetTrainerByToken(token: string) {
  const supabase = (await import("@/lib/serverSupabase")).createServerSupabaseServiceClient()
  const response = await supabase
    .from("trainer_accounts")
    .select("id, email, first_name, last_name, email_verified, password_reset_token_hash, password_reset_expires_at")
    .eq("password_reset_token_hash", hashResetToken(token))
    .maybeSingle()
  if (response.error) throw response.error
  return response.data ?? null
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }
    const body = await request.json()
    const email = sanitizeTextInput(body.email, { lowercase: true, maxLength: 254 })
    if (!email) {
      return new NextResponse("Bitte eine E-Mail-Adresse angeben.", { status: 400 })
    }
    const rateLimit = await checkRateLimitAsync(`trainer-password-reset:${getRequestIp(request)}:${email}`, 5, 15 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }
    const trainer = await findTrainerByEmail(email)
    if (!trainer?.id || !trainer.email || trainer.email_verified !== true) {
      return NextResponse.json({
        ok: true,
        message: "Wenn ein passender Trainer existiert, wurde ein Reset-Link versendet.",
      })
    }
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + TRAINER_PASSWORD_RESET_WINDOW_MS).toISOString()
    await storeResetToken(trainer.id, hashResetToken(token), expiresAt)
    const baseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
    const resetLink = `${baseUrl}/trainer/passwort-zuruecksetzen?token=${encodeURIComponent(token)}`
    await sendCustomEmail({
      to: trainer.email,
      subject: "TSV BoxGym: Passwort für Trainerbereich neu setzen",
      text: `Hallo ${trainer.first_name || "Trainer"},

für deinen Trainerzugang wurde ein Link zum Zurücksetzen des Passworts angefordert.

Wichtig: Der Link funktioniert nur für dieses Trainerkonto und nur solange die hinterlegte E-Mail-Adresse bereits bestätigt wurde.

Link: ${resetLink}

Der Link ist 30 Minuten gültig.

Falls du diese Anfrage nicht selbst gestellt hast, kannst du diese E-Mail ignorieren.

TSV BoxGym`,
    })
    return NextResponse.json({
      ok: true,
      message: "Wenn ein passender Trainer existiert, wurde ein Reset-Link versendet.",
    })
  } catch (error) {
    console.error("trainer password reset failed", error)
    return new NextResponse(error instanceof Error ? error.message : "Interner Fehler", { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }
    const token = sanitizeTextInput(new URL(request.url).searchParams.get("token"), { maxLength: 256 })
    if (!token) {
      return new NextResponse("Reset-Link fehlt.", { status: 400 })
    }
    const trainer = await readResetTrainerByToken(token)
    if (!trainer) {
      return NextResponse.json({ valid: false, message: "Reset-Link ist ungültig oder wurde bereits verwendet." }, { status: 404 })
    }
    if (isExpiredReset(trainer)) {
      await clearResetToken(trainer.id)
      return NextResponse.json({ valid: false, message: "Reset-Link ist abgelaufen. Bitte fordere einen neuen Link an." }, { status: 410 })
    }
    return NextResponse.json({ valid: true, email: trainer.email ?? "" })
  } catch (error) {
    console.error("trainer password reset verification failed", error)
    return new NextResponse(error instanceof Error ? error.message : "Interner Fehler", { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }
    const body = await request.json()
    const token = sanitizeTextInput(body.token, { maxLength: 256 })
    const newPassword = sanitizeTextInput(body.newPassword, { maxLength: 128 })
    if (!token || !newPassword) {
      return new NextResponse("Bitte Reset-Link und neues Passwort angeben.", { status: 400 })
    }
    if (!isTrainerPinCompliant(newPassword)) {
      return new NextResponse("Das Passwort muss 8 bis 64 Zeichen lang sein und darf keine Leerzeichen enthalten.", { status: 400 })
    }
    const rateLimit = await checkRateLimitAsync(`trainer-password-reset-confirm:${getRequestIp(request)}`, 10, 15 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }
    const trainer = await readResetTrainerByToken(token)
    if (!trainer?.id || !trainer.email) {
      return new NextResponse("Reset-Link ist ungültig oder wurde bereits verwendet.", { status: 400 })
    }
    if (isExpiredReset(trainer)) {
      await clearResetToken(trainer.id)
      return new NextResponse("Reset-Link ist abgelaufen. Bitte fordere einen neuen Link an.", { status: 410 })
    }
    await updateTrainerAccountPin(trainer.id, newPassword)
    await clearResetToken(trainer.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("trainer password reset confirm failed", error)
    return new NextResponse(error instanceof Error ? error.message : "Interner Fehler", { status: 500 })
  }
}
