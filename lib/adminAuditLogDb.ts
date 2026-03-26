import type { TrainerSessionPayload } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

export type AdminAuditLogRecord = {
  id: string
  actor_role: string
  actor_email: string | null
  actor_name: string | null
  action: string
  target_type: string
  target_id: string | null
  target_name: string | null
  details: string | null
  created_at: string
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("admin_audit_log")
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export async function writeAdminAuditLog(input: {
  session: Pick<TrainerSessionPayload, "accountRole" | "accountEmail" | "accountFirstName" | "accountLastName">
  action: string
  targetType: string
  targetId?: string | null
  targetName?: string | null
  details?: string | null
}) {
  const supabase = getServerSupabase()
  const actorName = `${input.session.accountFirstName ?? ""} ${input.session.accountLastName ?? ""}`.trim()

  const { error } = await supabase.from("admin_audit_log").insert([
    {
      actor_role: input.session.accountRole,
      actor_email: input.session.accountEmail || null,
      actor_name: actorName || null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      target_name: input.targetName ?? null,
      details: input.details?.trim() || null,
    },
  ])

  if (error && !isMissingTableError(error)) {
    throw error
  }
}

export async function getAdminAuditLogs(limit = 50) {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("*")
    .neq("action", "manual_parent_mail_draft")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }

  return (data as AdminAuditLogRecord[] | null) ?? []
}
