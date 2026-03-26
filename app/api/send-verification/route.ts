import { NextResponse } from "next/server"
import { checkRateLimit, getRequestIp, isAllowedAppLink, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { enqueueAdminNotification } from "@/lib/adminDigestDb"
import { enqueueOutgoingMail } from "@/lib/outgoingMailQueueDb"
import { getAdminNotificationAddress, getAppBaseUrl, getMailFromAddress, getReplyToAddress } from "@/lib/mailConfig"
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

    const rateLimit = checkRateLimit(`send-verification:${getRequestIp(request)}`, 30, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const { purpose = "verification", email, name, link, kind, group } = (await request.json()) as SendVerificationBody

    if (purpose === "admin_notification") {
      if (!name || !kind) {
        return new NextResponse("Missing name or kind", { status: 400 })
      }

      const queued = await enqueueAdminNotification({
        kind,
        memberName: name,
        email,
        group,
      })

      return NextResponse.json({ ok: true, queued: Boolean(queued) })
    }

    if (purpose === "approval_notice") {
      if (!email || !kind) {
        return new NextResponse("Missing email or kind", { status: 400 })
      }

      await sendApprovalEmail({
        email,
        name,
        kind,
        group,
      })

      return NextResponse.json({ ok: true })
    }

    if (purpose === "access_code_changed") {
      if (!email || !kind || kind === "trainer") {
        return new NextResponse("Missing email or invalid kind", { status: 400 })
      }

      await sendAccessCodeChangedEmail({
        email,
        name,
        kind,
      })

      return NextResponse.json({ ok: true })
    }

    if (purpose === "competition_assigned") {
      if (!email) {
        return new NextResponse("Missing email", { status: 400 })
      }

      await enqueueOutgoingMail({
        purpose: "competition_assigned",
        email,
        name,
      })

      return NextResponse.json({ ok: true, queued: true })
    }

    if (purpose === "competition_removed") {
      if (!email) {
        return new NextResponse("Missing email", { status: 400 })
      }

      await enqueueOutgoingMail({
        purpose: "competition_removed",
        email,
        name,
      })

      return NextResponse.json({ ok: true, queued: true })
    }

    if (!email || !link) {
      return new NextResponse("Missing email or link", { status: 400 })
    }

    if (!isAllowedAppLink(link, request)) {
      return new NextResponse("Invalid link origin", { status: 400 })
    }

    await sendVerificationEmail({ email, name, link, kind })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("send-verification failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
