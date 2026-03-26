import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

export type AdminNotificationQueueKind = "member" | "trainer" | "boxzwerge"

export type AdminNotificationQueueRecord = {
  id: string
  kind: AdminNotificationQueueKind
  member_name: string
  email: string | null
  group_name: string | null
  created_at: string
  sent_at: string | null
  sent_batch_key: string | null
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || (message.includes("could not find the table") && message.includes("admin_notification_queue"))
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export async function enqueueAdminNotification(input: {
  kind: AdminNotificationQueueKind
  memberName: string
  email?: string
  group?: string
}) {
  const supabase = getServerSupabase()
  const normalizedMemberName = input.memberName.trim()
  const normalizedEmail = input.email?.trim().toLowerCase() || null
  const normalizedGroup = input.group?.trim() || null

  const existingResponse = await supabase
    .from("admin_notification_queue")
    .select("*")
    .eq("kind", input.kind)
    .eq("member_name", normalizedMemberName)
    .eq("group_name", normalizedGroup)
    .is("sent_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingResponse.error) {
    if (isMissingTableError(existingResponse.error)) return null
    throw existingResponse.error
  }

  if (existingResponse.data?.id) {
    const existing = existingResponse.data as AdminNotificationQueueRecord

    if (existing.email !== normalizedEmail) {
      const { data, error } = await supabase
        .from("admin_notification_queue")
        .update({
          email: normalizedEmail,
        })
        .eq("id", existing.id)
        .select("*")
        .single()

      if (error) throw error
      return data as AdminNotificationQueueRecord
    }

    return existing
  }

  const { data, error } = await supabase
    .from("admin_notification_queue")
    .insert([
      {
        kind: input.kind,
        member_name: normalizedMemberName,
        email: normalizedEmail,
        group_name: normalizedGroup,
      },
    ])
    .select("*")
    .single()

  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  return data as AdminNotificationQueueRecord
}

export async function getPendingAdminNotifications() {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("admin_notification_queue")
    .select("*")
    .is("sent_at", null)
    .order("created_at", { ascending: true })

  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return (data as AdminNotificationQueueRecord[] | null) ?? []
}

export async function markAdminNotificationsSent(ids: string[], batchKey: string) {
  if (ids.length === 0) return []

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("admin_notification_queue")
    .update({
      sent_at: new Date().toISOString(),
      sent_batch_key: batchKey,
    })
    .in("id", ids)
    .select("*")

  if (error) throw error
  return (data as AdminNotificationQueueRecord[] | null) ?? []
}
