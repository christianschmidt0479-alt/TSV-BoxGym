import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { checkRateLimitAsync, getRequestIp, isAllowedAppLink, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { enqueueAdminNotification } from "@/lib/adminDigestDb"
import { validateEmail } from "@/lib/formValidation"
import { enqueueOutgoingMail } from "@/lib/outgoingMailQueueDb"
import { getAdminNotificationAddress, getAppBaseUrl, getMailFromAddress, getReplyToAddress } from "@/lib/mailConfig"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import {
  sendAccessCodeChangedEmail,
  sendApprovalEmail,
  sendVerificationEmail,
} from "@/lib/resendClient"

type SendVerificationBody = {
  purpose?:
    | "verification"
    | "admin_notification"
    | "approval_notice"
    | "access_code_changed"
    | "competition_assigned"
    | "competition_removed"
  email?: string
  name?: string
  link?: string
  kind?: "member" | "trainer" | "boxzwerge"
  group?: string
}

async function requireAdminSessionForMailRequest(request: Request) {
  const session = await readTrainerSessionFromHeaders(request)
  if (!session || session.accountRole !== "admin") {
    return { error: new NextResponse("Forbidden", { status: 403 }), session: null }
  }

  return { error: null, session }
}

function normalizeMailKind(value: SendVerificationBody["kind"]) {
  if (value === "member" || value === "trainer" || value === "boxzwerge") {
    return value
  }

  return undefined
}

async function applyMailCooldown(scope: string, identifier: string, limit: number, windowMs: number) {
  const rateLimit = await checkRateLimitAsync(`${scope}:${identifier}`, limit, windowMs)
  if (!rateLimit.ok) {
    return new NextResponse("Too many requests", { status: 429 })
  }

  return null
}

export async function GET() {
  return new NextResponse("Method not allowed", { status: 405 })
}

async function handleMailConfigRequest(request: Request) {
  const session = await readTrainerSessionFromHeaders(request)
  if (!session || session.accountRole !== "admin") {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const hasServerKey = Boolean(process.env.RESEND_API_KEY)
  const hasPublicFallback = process.env.NODE_ENV !== "production" && Boolean(process.env.NEXT_PUBLIC_RESEND_API_KEY)
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()
  const appBaseUrl = getAppBaseUrl()
  const adminNotificationEmail = getAdminNotificationAddress()

  return NextResponse.json({
    configured: hasServerKey || hasPublicFallback,
    using_server_key: hasServerKey,
    using_public_fallback: !hasServerKey && hasPublicFallback,
    from,
    reply_to: replyTo,
    app_base_url: appBaseUrl,
    admin_notification_email: adminNotificationEmail,
  })
}

export async function PUT(request: Request) {
  return handleMailConfigRequest(request)
}

export async function HEAD(request: Request) {
  const session = await readTrainerSessionFromHeaders(request)
  if (!session || session.accountRole !== "admin") {
    return new NextResponse(null, { status: 403 })
  }

  return new NextResponse(null, { status: 200 })
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const rateLimit = await checkRateLimitAsync(`send-verification:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const { purpose = "verification", email, name, link, kind, group } = (await request.json()) as SendVerificationBody
    const normalizedEmail = email?.trim().toLowerCase() ?? ""
    const normalizedName = name?.trim() ?? ""
    const normalizedKind = normalizeMailKind(kind)
    const normalizedGroup = group?.trim() ?? ""

    if (purpose === "admin_notification") {
      const { error: authError } = await requireAdminSessionForMailRequest(request)
      if (authError) return authError

      if (!normalizedName || !normalizedKind) {
        return new NextResponse("Missing name or kind", { status: 400 })
      }

      const cooldownError = await applyMailCooldown(
        "send-verification:admin-notification",
        `${normalizedKind}:${normalizedEmail || normalizedName.toLowerCase()}`,
        1,
        60 * 1000
      )
      if (cooldownError) return cooldownError

      const queued = await enqueueAdminNotification({
        kind: normalizedKind,
        memberName: normalizedName,
        email: normalizedEmail || undefined,
        group: normalizedGroup || undefined,
      })

      return NextResponse.json({ ok: true, queued: Boolean(queued) })
    }

    if (purpose === "approval_notice") {
      const { error: authError, session } = await requireAdminSessionForMailRequest(request)
      if (authError) return authError

      if (!normalizedEmail || !normalizedKind) {
        return new NextResponse("Missing email or kind", { status: 400 })
      }

      const emailValidation = validateEmail(normalizedEmail)
      if (!emailValidation.valid) {
        return new NextResponse(emailValidation.error || "Invalid email", { status: 400 })
      }

      await sendApprovalEmail({
        email: normalizedEmail,
        name: normalizedName || undefined,
        kind: normalizedKind,
        group: normalizedGroup || undefined,
      })

      await writeAdminAuditLog({
        session,
        action: "approval_notice_sent",
        targetType: normalizedKind,
        targetName: normalizedName || normalizedEmail,
        details: `Mail an ${normalizedEmail}${normalizedGroup ? `, Gruppe: ${normalizedGroup}` : ""}`,
      })

      return NextResponse.json({ ok: true })
    }

    if (purpose === "access_code_changed") {
      const { error: authError, session } = await requireAdminSessionForMailRequest(request)
      if (authError) return authError

      if (!normalizedEmail || !normalizedKind || normalizedKind === "trainer") {
        return new NextResponse("Missing email or invalid kind", { status: 400 })
      }

      const emailValidation = validateEmail(normalizedEmail)
      if (!emailValidation.valid) {
        return new NextResponse(emailValidation.error || "Invalid email", { status: 400 })
      }

      await sendAccessCodeChangedEmail({
        email: normalizedEmail,
        name: normalizedName || undefined,
        kind: normalizedKind,
      })

      await writeAdminAuditLog({
        session,
        action: "access_code_changed_notice_sent",
        targetType: normalizedKind,
        targetName: normalizedName || normalizedEmail,
        details: `Mail an ${normalizedEmail}`,
      })

      return NextResponse.json({ ok: true })
    }

    if (purpose === "competition_assigned") {
      const { error: authError, session } = await requireAdminSessionForMailRequest(request)
      if (authError) return authError

      if (!normalizedEmail) {
        return new NextResponse("Missing email", { status: 400 })
      }

      const emailValidation = validateEmail(normalizedEmail)
      if (!emailValidation.valid) {
        return new NextResponse(emailValidation.error || "Invalid email", { status: 400 })
      }

      await enqueueOutgoingMail({
        purpose: "competition_assigned",
        email: normalizedEmail,
        name: normalizedName || undefined,
      })

      await writeAdminAuditLog({
        session,
        action: "competition_assigned_notice_queued",
        targetType: "member",
        targetName: normalizedName || normalizedEmail,
        details: `Mail an ${normalizedEmail}`,
      })

      return NextResponse.json({ ok: true, queued: true })
    }

    if (purpose === "competition_removed") {
      const { error: authError, session } = await requireAdminSessionForMailRequest(request)
      if (authError) return authError

      if (!normalizedEmail) {
        return new NextResponse("Missing email", { status: 400 })
      }

      const emailValidation = validateEmail(normalizedEmail)
      if (!emailValidation.valid) {
        return new NextResponse(emailValidation.error || "Invalid email", { status: 400 })
      }

      await enqueueOutgoingMail({
        purpose: "competition_removed",
        email: normalizedEmail,
        name: normalizedName || undefined,
      })

      await writeAdminAuditLog({
        session,
        action: "competition_removed_notice_queued",
        targetType: "member",
        targetName: normalizedName || normalizedEmail,
        details: `Mail an ${normalizedEmail}`,
      })

      return NextResponse.json({ ok: true, queued: true })
    }

    // Member-Verifizierung: Token immer frisch aus DB lesen/erneuern, nie aus Client-State übernehmen.
    if (purpose === "verification" && (!normalizedKind || normalizedKind === "member")) {
      const emailValidation = validateEmail(normalizedEmail)
      if (!emailValidation.valid) {
        return new NextResponse(emailValidation.error || "Invalid email", { status: 400 })
      }

      const supabase = createServerSupabaseServiceClient()
      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, email_verification_token, email_verification_expires_at")
        .eq("email", normalizedEmail)
        .maybeSingle()

      if (memberError) {
        throw memberError
      }

      if (!member?.id) {
        return new NextResponse("Member not found", { status: 404 })
      }

      const existingToken = typeof member.email_verification_token === "string" ? member.email_verification_token.trim() : ""
      const expiresAtRaw = typeof member.email_verification_expires_at === "string" ? member.email_verification_expires_at : ""
      const isExpired = expiresAtRaw ? new Date(expiresAtRaw).getTime() < Date.now() : false

      let verificationToken = existingToken
      if (!verificationToken || isExpired) {
        verificationToken = randomUUID()
        const nextExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString()
        const { error: tokenUpdateError } = await supabase
          .from("members")
          .update({
            email_verification_token: verificationToken,
            email_verification_expires_at: nextExpiresAt,
            last_verification_sent_at: new Date().toISOString(),
          })
          .eq("id", member.id)

        if (tokenUpdateError) {
          throw tokenUpdateError
        }
      }

      await sendVerificationEmail({ email: normalizedEmail, token: verificationToken })
      return NextResponse.json({ ok: true })
    }

    // Link-basierter Flow für Nicht-Member (z. B. Trainer), inklusive bestehender Rate-Limits.
    if (!normalizedEmail || !link) {
      return new NextResponse("Missing email or link", { status: 400 })
    }

    const emailValidation = validateEmail(normalizedEmail)
    if (!emailValidation.valid) {
      return new NextResponse(emailValidation.error || "Invalid email", { status: 400 })
    }

    const verificationCooldownError = await applyMailCooldown(
      "send-verification:verification",
      normalizedEmail,
      1,
      60 * 1000
    )
    if (verificationCooldownError) return verificationCooldownError

    const verificationBurstError = await applyMailCooldown(
      "send-verification:verification-burst",
      normalizedEmail,
      3,
      30 * 60 * 1000
    )
    if (verificationBurstError) return verificationBurstError

    if (!isAllowedAppLink(link, request)) {
      return new NextResponse("Invalid link origin", { status: 400 })
    }

    await sendVerificationEmail({
      email: normalizedEmail,
      name: normalizedName || undefined,
      link,
      kind: normalizedKind,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("send-verification failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
