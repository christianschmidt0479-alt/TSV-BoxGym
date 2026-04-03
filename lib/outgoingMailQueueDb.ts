import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

export type OutgoingMailQueuePurpose =
  | "competition_assigned"
  | "competition_removed"
  | "medical_exam_reminder_member"
  | "medical_exam_reminder_admin"

export type OutgoingMailQueueRecord = {
  id: string
  purpose: OutgoingMailQueuePurpose
  email: string
  name: string | null
  context_key: string | null
  created_at: string
  sent_at: string | null
  sent_batch_key: string | null
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || (message.includes("could not find the table") && message.includes("outgoing_mail_queue"))
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export async function enqueueOutgoingMail(input: {
  purpose: OutgoingMailQueuePurpose
  email: string
  name?: string
  contextKey?: string
}) {
  const supabase = getServerSupabase()
  const normalizedEmail = input.email.trim().toLowerCase()

  if (input.contextKey?.trim()) {
    const existing = await supabase
      .from("outgoing_mail_queue")
      .select("*")
      .eq("purpose", input.purpose)
      .eq("email", normalizedEmail)
      .eq("context_key", input.contextKey.trim())
      .limit(1)

    if (existing.error && !isMissingTableError(existing.error)) {
      throw existing.error
    }

    if (existing.data?.[0]) {
      return existing.data[0] as OutgoingMailQueueRecord
    }
  }

  const { data, error } = await supabase
    .from("outgoing_mail_queue")
    .insert([
      {
        purpose: input.purpose,
        email: normalizedEmail,
        name: input.name?.trim() || null,
        context_key: input.contextKey?.trim() || null,
      },
    ])
    .select("*")
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        "Die Datenbank kennt den Mail-Ausgang noch nicht. Bitte führe zuerst supabase/outgoing_mail_queue.sql in Supabase aus."
      )
    }
    throw error
  }

  return data as OutgoingMailQueueRecord
}

export async function getPendingOutgoingMails() {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("outgoing_mail_queue")
    .select("*")
    .is("sent_at", null)
    .order("created_at", { ascending: true })

  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }

  return (data as OutgoingMailQueueRecord[] | null) ?? []
}

export async function markOutgoingMailsSent(ids: string[], batchKey: string) {
  if (ids.length === 0) return []

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("outgoing_mail_queue")
    .update({
      sent_at: new Date().toISOString(),
      sent_batch_key: batchKey,
    })
    .in("id", ids)
    .select("*")

  if (error) throw error
  return (data as OutgoingMailQueueRecord[] | null) ?? []
}
