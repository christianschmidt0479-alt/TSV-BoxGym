import { createHash, randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin, sanitizeTextInput } from "@/lib/apiSecurity"
import { hashAuthSecret } from "@/lib/authSecret"
import { findMemberByEmail } from "@/lib/boxgymDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { ensureMemberAuthUserLink } from "@/lib/memberAuthLink"
import { isValidMemberPassword, MEMBER_PASSWORD_REQUIREMENTS_MESSAGE } from "@/lib/memberPassword"
import { sendCustomEmail } from "@/lib/resendClient"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

const MEMBER_PASSWORD_RESET_WINDOW_MS = 30 * 60 * 1000

type MemberPasswordResetBody =
  | {
      action: "request"
      email?: string
    }
  | {
      action: "confirm"
      token?: string
      newPassword?: string
    }

type MemberPasswordResetRow = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  email_verified?: boolean | null
  password_reset_token_hash?: string | null
  password_reset_expires_at?: string | null
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function getMemberDisplayName(member?: Pick<MemberPasswordResetRow, "first_name" | "last_name"> | null) {
  const first = member?.first_name?.trim() ?? ""
  const last = member?.last_name?.trim() ?? ""
  return `${first} ${last}`.trim() || "TSV BoxGym Mitglied"
}

function isMissingPasswordResetColumnError(error: { message?: string; details?: string; code?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  const looksMissingColumn =
    error?.code === "PGRST204" ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")

  if (!looksMissingColumn) return false
  return message.includes("password_reset_token_hash") || message.includes("password_reset_expires_at")
}

function getPasswordResetMigrationError() {
  return new Error(
    "Die Datenbank kennt den Mitglieder-Passwort-Reset noch nicht. Bitte fuehre zuerst supabase/member_password_reset.sql in Supabase aus."
  )
}

async function storeResetToken(memberId: string, tokenHash: string, expiresAt: string) {
  const supabase = getServerSupabase()
  const response = await supabase
    .from("members")
    .update({
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: expiresAt,
    })
    .eq("id", memberId)

  if (response.error) {
    if (isMissingPasswordResetColumnError(response.error)) {
      throw getPasswordResetMigrationError()
    }

    throw response.error
  }
}

async function readResetMemberByToken(token: string) {
  const supabase = getServerSupabase()
  const response = await supabase
    .from("members")
    .select("id, email, first_name, last_name, email_verified, password_reset_token_hash, password_reset_expires_at")
    .eq("password_reset_token_hash", hashResetToken(token))
    .maybeSingle()

  if (response.error) {
    if (isMissingPasswordResetColumnError(response.error)) {
      throw getPasswordResetMigrationError()
    }

    throw response.error
  }

  return (response.data as MemberPasswordResetRow | null) ?? null
}

async function clearResetToken(memberId: string) {
  const supabase = getServerSupabase()
  const response = await supabase
    .from("members")
    .update({
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    })
    .eq("id", memberId)

  if (response.error) {
    if (isMissingPasswordResetColumnError(response.error)) {
      throw getPasswordResetMigrationError()
    }

    throw response.error
  }
}

async function updateMemberPassword(memberId: string, newPassword: string) {
  const supabase = getServerSupabase()
  const response = await supabase
    .from("members")
    .update({
      member_pin: await hashAuthSecret(newPassword),
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    })
    .eq("id", memberId)
    .select("id, email, email_verified")
    .maybeSingle()

  if (response.error) {
    if (isMissingPasswordResetColumnError(response.error)) {
      throw getPasswordResetMigrationError()
    }

    throw response.error
  }

  return response.data as { id: string; email?: string | null; email_verified?: boolean | null } | null
}

function isExpiredReset(member: MemberPasswordResetRow | null) {
  if (!member?.password_reset_expires_at) return true
  return new Date(member.password_reset_expires_at).getTime() < Date.now()
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

    const member = await readResetMemberByToken(token)
    if (!member) {
      return NextResponse.json({ valid: false, message: "Reset-Link ist ungültig oder wurde bereits verwendet." }, { status: 404 })
    }

    if (isExpiredReset(member)) {
      await clearResetToken(member.id)
      return NextResponse.json({ valid: false, message: "Reset-Link ist abgelaufen. Bitte fordere einen neuen Link an." }, { status: 410 })
    }

    return NextResponse.json({ valid: true, email: member.email ?? "" })
  } catch (error) {
    console.error("member password reset verification failed", error)
    return new NextResponse(error instanceof Error ? error.message : "Interner Fehler", { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as MemberPasswordResetBody

    if (body.action === "request") {
      if (process.env.NODE_ENV !== "production") {
        console.log("PASSWORD_RESET_START")
      }
      const email = sanitizeTextInput(body.email, { lowercase: true, maxLength: 254 })
      if (!email) {
        return new NextResponse("Bitte eine E-Mail-Adresse angeben.", { status: 400 })
      }

      const rateLimit = await checkRateLimitAsync(`member-password-reset:${getRequestIp(request)}:${email}`, 5, 15 * 60 * 1000)
      if (!rateLimit.ok) {
        return new NextResponse("Too many requests", { status: 429 })
      }

      const member = (await findMemberByEmail(email)) as MemberPasswordResetRow | null
      if (process.env.NODE_ENV !== "production") {
        console.log("PASSWORD_RESET_MEMBER_FOUND", {
          found: !!(member?.id && member.email) ? "yes" : "no",
          id: member?.id || null,
          email: member?.email || null,
          email_verified: member?.email_verified === true ? "yes" : "no"
        })
      }

      if (!member?.id || !member.email) {
        return NextResponse.json({
          ok: true,
          message: "Wenn ein passendes Mitglied existiert, wurde ein Reset-Link versendet.",
        })
      }
      if (process.env.NODE_ENV !== "production") {
        console.log("PASSWORD_RESET_ALLOW_UNVERIFIED", { id: member.id, email: member.email, email_verified: member.email_verified === true ? "yes" : "no" })
      }

      const token = randomBytes(32).toString("hex")
      const expiresAt = new Date(Date.now() + MEMBER_PASSWORD_RESET_WINDOW_MS).toISOString()
      await storeResetToken(member.id, hashResetToken(token), expiresAt)

      const baseUrl = getAppBaseUrl() || DEFAULT_APP_BASE_URL
      const resetLink = `${baseUrl}/mein-bereich/passwort-zuruecksetzen?token=${encodeURIComponent(token)}`

      if (process.env.NODE_ENV !== "production") {
        console.log("PASSWORD_RESET_MAIL_START", { id: member.id, email: member.email })
      }
      try {
        // Zentrales, professionelles Template nutzen
        const { buildMemberMail } = await import("@/lib/mail/renderMailTemplate")
        const subject = "Passwort neu setzen – TSV BoxGym"
        const name = getMemberDisplayName(member)
        const html = buildMemberMail({
          title: "Passwort neu setzen",
          intro: `Hallo ${name}, du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.`,
          ctaLabel: "Passwort jetzt neu setzen",
          ctaUrl: resetLink,
          securityNotice: "Link 30 Minuten gültig. Falls nicht von dir, ignorieren."
        })
        const text = `Hallo ${getMemberDisplayName(member)},\n\nDu hast eine Anfrage zum Zurücksetzen deines Passworts gestellt. Nutze diesen Link, um ein neues Passwort zu vergeben: ${resetLink}\n\nDer Link ist 30 Minuten gültig.\n\nFalls du diese Anfrage nicht selbst gestellt hast, kannst du diese E-Mail ignorieren.`
        const { sendMail } = await import("@/lib/mail/mailService")
        await sendMail({
          to: member.email,
          subject,
          html,
          text,
        })
        // MAIL_SERVICE_SEND_START und MAIL_SEND_SUCCESS werden im Service geloggt
      } catch (err) {
        let errorMsg = "";
        if (err && typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
          errorMsg = (err as any).message;
        } else {
          errorMsg = String(err);
        }
        if (process.env.NODE_ENV !== "production") {
          console.error("MAIL_SEND_ERROR", { id: member.id, email: member.email, error: errorMsg })
        }
      }

      return NextResponse.json({
        ok: true,
        message: "Wenn ein passendes Mitglied mit bestätigter E-Mail existiert, wurde ein Reset-Link versendet.",
      })
    }

    if (body.action === "confirm") {
      const token = sanitizeTextInput(body.token, { maxLength: 256 })
      const newPassword = sanitizeTextInput(body.newPassword, { maxLength: 128 })

      if (!token || !newPassword) {
        return new NextResponse("Bitte Reset-Link und neues Passwort angeben.", { status: 400 })
      }

      if (!isValidMemberPassword(newPassword)) {
        return new NextResponse(MEMBER_PASSWORD_REQUIREMENTS_MESSAGE, { status: 400 })
      }

      const rateLimit = await checkRateLimitAsync(`member-password-reset-confirm:${getRequestIp(request)}`, 10, 15 * 60 * 1000)
      if (!rateLimit.ok) {
        return new NextResponse("Too many requests", { status: 429 })
      }

      const member = await readResetMemberByToken(token)
      if (!member?.id || !member.email) {
        return new NextResponse("Reset-Link ist ungültig oder wurde bereits verwendet.", { status: 400 })
      }

      if (isExpiredReset(member)) {
        await clearResetToken(member.id)
        return new NextResponse("Reset-Link ist abgelaufen. Bitte fordere einen neuen Link an.", { status: 410 })
      }

      const updated = await updateMemberPassword(member.id, newPassword)
      await ensureMemberAuthUserLink({
        memberId: member.id,
        email: updated?.email ?? member.email,
        password: newPassword,
        emailVerified: Boolean(updated?.email_verified ?? member.email_verified),
      })

      return NextResponse.json({ ok: true })
    }

    return new NextResponse("Invalid action", { status: 400 })
  } catch (error) {
    console.error("member password reset failed", error)
    return new NextResponse(error instanceof Error ? error.message : "Interner Fehler", { status: 500 })
  }
}