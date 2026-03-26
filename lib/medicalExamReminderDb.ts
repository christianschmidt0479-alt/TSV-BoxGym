import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { enqueueOutgoingMail } from "@/lib/outgoingMailQueueDb"
import { getAdminNotificationAddress } from "@/lib/mailConfig"

type CompetitionMemberReminderRow = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  is_competition_member?: boolean | null
  last_medical_exam_date?: string | null
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

function getDisplayName(member: CompetitionMemberReminderRow) {
  const first = member.first_name?.trim() ?? ""
  const last = member.last_name?.trim() ?? ""
  return `${first} ${last}`.trim() || member.name?.trim() || "Sportler"
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function getDaysUntil(targetDateString: string, baseDate = new Date()) {
  const base = new Date(`${baseDate.toISOString().slice(0, 10)}T12:00:00`)
  const target = new Date(`${targetDateString}T12:00:00`)
  return Math.round((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24))
}

export async function enqueueMedicalExamReminderMails() {
  const supabase = getServerSupabase()
  const adminEmail = getAdminNotificationAddress()
  const { data, error } = await supabase
    .from("members")
    .select("id, name, first_name, last_name, email, is_competition_member, last_medical_exam_date")
    .eq("is_competition_member", true)
    .not("last_medical_exam_date", "is", null)

  if (error) throw error

  let queued = 0

  for (const member of ((data as CompetitionMemberReminderRow[] | null) ?? [])) {
    if (!member.email || !member.last_medical_exam_date) continue

    const dueDate = addDays(member.last_medical_exam_date, 365)
    const daysUntilDue = getDaysUntil(dueDate)

    if (daysUntilDue < 21 || daysUntilDue > 28) continue

    const contextSuffix = `${member.id}:${dueDate}`
    const displayName = getDisplayName(member)

    await enqueueOutgoingMail({
      purpose: "medical_exam_reminder_member",
      email: member.email,
      name: displayName,
      contextKey: `medical_exam_reminder_member:${contextSuffix}`,
    })
    queued += 1

    if (adminEmail) {
      await enqueueOutgoingMail({
        purpose: "medical_exam_reminder_admin",
        email: adminEmail,
        name: displayName,
        contextKey: `medical_exam_reminder_admin:${contextSuffix}`,
      })
      queued += 1
    }
  }

  return queued
}
