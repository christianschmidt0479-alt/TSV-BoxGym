import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getPendingAdminNotifications, markAdminNotificationsSent } from "@/lib/adminDigestDb"
import { enqueueMedicalExamReminderMails } from "@/lib/medicalExamReminderDb"
import { isManualParentMailRecord } from "@/lib/manualParentMailOutboxDb"
import { getPendingOutgoingMails, markOutgoingMailsSent } from "@/lib/outgoingMailQueueDb"
import {
  sendAdminDigestEmail,
  sendCompetitionAssignedEmail,
  sendCompetitionRemovedEmail,
  sendMedicalExamReminderAdminEmail,
  sendMedicalExamReminderEmail,
} from "@/lib/resendClient"

function getBerlinParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    weekday: parts.weekday ?? "",
    year: parts.year ?? "",
    month: parts.month ?? "",
    day: parts.day ?? "",
    hour: parts.hour ?? "",
    minute: parts.minute ?? "",
  }
}

function isWeekdayInBerlin(date = new Date()) {
  const { weekday } = getBerlinParts(date)
  return ["Mo.", "Di.", "Mi.", "Do.", "Fr."].includes(weekday)
}

function isNineOClockInBerlin(date = new Date()) {
  const { hour } = getBerlinParts(date)
  return hour === "09"
}

function getBatchKey(date = new Date()) {
  const { year, month, day, hour, minute } = getBerlinParts(date)
  return `${year}-${month}-${day}-${hour}-${minute}`
}

function getDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "full",
  }).format(date)
}

function getDueDateFromContextKey(contextKey: string | null) {
  if (!contextKey) return undefined
  const parts = contextKey.split(":")
  return parts[parts.length - 1] || undefined
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  const url = new URL(request.url)
  const force = url.searchParams.get("force") === "1"

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const now = new Date()

  if (!force && !isWeekdayInBerlin(now)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "not_weekday_in_berlin",
    })
  }

  if (!force && !isNineOClockInBerlin(now)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "not_09_00_in_berlin",
    })
  }

  await enqueueMedicalExamReminderMails()

  const [items, outgoingMails] = await Promise.all([
    getPendingAdminNotifications(),
    getPendingOutgoingMails(),
  ])

  const sendableOutgoingMails = outgoingMails.filter((item) => !isManualParentMailRecord(item))

  if (items.length === 0 && sendableOutgoingMails.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no_pending_messages",
    })
  }

  const batchKey = getBatchKey(now)

  if (items.length > 0) {
    await sendAdminDigestEmail({
      dateLabel: getDateLabel(now),
      items: items.map((item) => ({
        kind: item.kind,
        memberName: item.member_name,
        email: item.email,
        group: item.group_name,
        createdAt: item.created_at,
      })),
    })

    await markAdminNotificationsSent(
      items.map((item) => item.id),
      batchKey
    )
  }

  for (const item of sendableOutgoingMails) {
    if (item.purpose === "competition_assigned") {
      await sendCompetitionAssignedEmail({
        email: item.email,
        name: item.name ?? undefined,
      })
      continue
    }

    if (item.purpose === "competition_removed") {
      await sendCompetitionRemovedEmail({
        email: item.email,
        name: item.name ?? undefined,
      })
      continue
    }

    if (item.purpose === "medical_exam_reminder_member") {
      await sendMedicalExamReminderEmail({
        email: item.email,
        name: item.name ?? undefined,
        dueDate: getDueDateFromContextKey(item.context_key),
      })
      continue
    }

    if (item.purpose === "medical_exam_reminder_admin") {
      await sendMedicalExamReminderAdminEmail({
        email: item.email,
        athleteName: item.name ?? undefined,
        dueDate: getDueDateFromContextKey(item.context_key),
      })
    }
  }

  if (sendableOutgoingMails.length > 0) {
    await markOutgoingMailsSent(
      sendableOutgoingMails.map((item) => item.id),
      batchKey
    )
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    count: items.length + sendableOutgoingMails.length,
    admin_count: items.length,
    outgoing_count: sendableOutgoingMails.length,
    batch_key: batchKey,
  })
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session || session.accountRole !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const rateLimit = await checkRateLimitAsync(`admin-digest:${getRequestIp(request)}`, 10, 10 * 60 * 1000)
  if (!rateLimit.ok) {
    return new NextResponse("Too many requests", { status: 429 })
  }

  const now = new Date()
  await enqueueMedicalExamReminderMails()

  const [items, outgoingMails] = await Promise.all([
    getPendingAdminNotifications(),
    getPendingOutgoingMails(),
  ])

  const sendableOutgoingMails = outgoingMails.filter((item) => !isManualParentMailRecord(item))

  if (items.length === 0 && sendableOutgoingMails.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no_pending_messages",
    })
  }

  const batchKey = getBatchKey(now)

  if (items.length > 0) {
    await sendAdminDigestEmail({
      dateLabel: getDateLabel(now),
      items: items.map((item) => ({
        kind: item.kind,
        memberName: item.member_name,
        email: item.email,
        group: item.group_name,
        createdAt: item.created_at,
      })),
    })

    await markAdminNotificationsSent(
      items.map((item) => item.id),
      batchKey
    )
  }

  for (const item of sendableOutgoingMails) {
    if (item.purpose === "competition_assigned") {
      await sendCompetitionAssignedEmail({
        email: item.email,
        name: item.name ?? undefined,
      })
      continue
    }

    if (item.purpose === "competition_removed") {
      await sendCompetitionRemovedEmail({
        email: item.email,
        name: item.name ?? undefined,
      })
      continue
    }

    if (item.purpose === "medical_exam_reminder_member") {
      await sendMedicalExamReminderEmail({
        email: item.email,
        name: item.name ?? undefined,
        dueDate: getDueDateFromContextKey(item.context_key),
      })
      continue
    }

    if (item.purpose === "medical_exam_reminder_admin") {
      await sendMedicalExamReminderAdminEmail({
        email: item.email,
        athleteName: item.name ?? undefined,
        dueDate: getDueDateFromContextKey(item.context_key),
      })
    }
  }

  if (sendableOutgoingMails.length > 0) {
    await markOutgoingMailsSent(
      sendableOutgoingMails.map((item) => item.id),
      batchKey
    )
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    count: items.length + sendableOutgoingMails.length,
    admin_count: items.length,
    outgoing_count: sendableOutgoingMails.length,
    batch_key: batchKey,
  })
}
