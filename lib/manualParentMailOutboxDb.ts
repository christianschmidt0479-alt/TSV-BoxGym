import type { ParentFamilyMailRow } from "@/lib/parentMailDrafts"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

const MANUAL_PARENT_MAIL_PREFIX = "manual_parent_mail:"
const MANUAL_PARENT_MAIL_PURPOSE = "competition_removed"

export type ManualParentMailDraft = {
  id: string
  parent_account_id: string
  parent_name: string
  parent_email: string
  parent_phone: string | null
  subject: string
  body: string
  link: string
  children: ParentFamilyMailRow["children"]
  created_at: string
}

type OutgoingMailQueueRow = {
  id: string
  purpose: string
  email: string
  name: string | null
  context_key?: string | null
  created_at: string
  sent_at: string | null
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

function isMissingContextKeyError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "42703" || message.includes("context_key")
}

function encodePayload(payload: Omit<ManualParentMailDraft, "id" | "created_at">) {
  return `${MANUAL_PARENT_MAIL_PREFIX}${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`
}

function decodePayload(row: Pick<OutgoingMailQueueRow, "name" | "context_key">) {
  const encodedValue = row.name?.startsWith(MANUAL_PARENT_MAIL_PREFIX) ? row.name : row.context_key
  if (!encodedValue || !encodedValue.startsWith(MANUAL_PARENT_MAIL_PREFIX)) return null

  try {
    const raw = encodedValue.slice(MANUAL_PARENT_MAIL_PREFIX.length)
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Omit<ManualParentMailDraft, "id" | "created_at">
  } catch {
    return null
  }
}

export function isManualParentMailRecord(input: { name?: string | null; context_key?: string | null }) {
  return Boolean(input.name?.startsWith(MANUAL_PARENT_MAIL_PREFIX) || input.context_key?.startsWith(MANUAL_PARENT_MAIL_PREFIX))
}

function toDraft(row: OutgoingMailQueueRow): ManualParentMailDraft | null {
  const payload = decodePayload(row)
  if (!payload) return null

  return {
    id: row.id,
    parent_account_id: payload.parent_account_id,
    parent_name: payload.parent_name,
    parent_email: payload.parent_email,
    parent_phone: payload.parent_phone ?? null,
    subject: payload.subject,
    body: payload.body,
    link: payload.link,
    children: Array.isArray(payload.children) ? payload.children : [],
    created_at: row.created_at,
  }
}

export async function upsertManualParentMailDraft(input: {
  parentAccountId: string
  parentName: string
  parentEmail: string
  parentPhone?: string | null
  subject: string
  body: string
  link: string
  children: ParentFamilyMailRow["children"]
}) {
  const supabase = getServerSupabase()
  const normalizedEmail = input.parentEmail.trim().toLowerCase()
  const encodedPayload = encodePayload({
    parent_account_id: input.parentAccountId,
    parent_name: input.parentName.trim(),
    parent_email: normalizedEmail,
    parent_phone: input.parentPhone?.trim() || null,
    subject: input.subject.trim(),
    body: input.body,
    link: input.link.trim(),
    children: input.children,
  })

  const existing = await supabase
    .from("outgoing_mail_queue")
    .select("*")
    .eq("purpose", MANUAL_PARENT_MAIL_PURPOSE)
    .eq("email", normalizedEmail)
    .like("name", `${MANUAL_PARENT_MAIL_PREFIX}%`)
    .limit(1)

  if (existing.error) {
    if (isMissingContextKeyError(existing.error)) {
      throw new Error("Der manuelle Postausgang ist in Production noch nicht vollständig erweitert.")
    }
    throw existing.error
  }

  if (existing.data?.[0]?.id) {
    const { data, error } = await supabase
      .from("outgoing_mail_queue")
      .update({
        name: encodedPayload,
        sent_at: null,
        sent_batch_key: null,
      })
      .eq("id", existing.data[0].id)
      .select("*")
      .single()

    if (error) {
      if (isMissingContextKeyError(error)) {
        throw new Error("Der manuelle Postausgang ist in Production noch nicht vollständig erweitert.")
      }
      throw error
    }
    const draft = toDraft(data as OutgoingMailQueueRow)
    if (!draft) throw new Error("Entwurf im Postausgang konnte nicht gelesen werden.")
    return draft
  }

  const { data, error } = await supabase
    .from("outgoing_mail_queue")
    .insert([
      {
        purpose: MANUAL_PARENT_MAIL_PURPOSE,
        email: normalizedEmail,
        name: encodedPayload,
      },
    ])
    .select("*")
    .single()

  if (error) {
    if (isMissingContextKeyError(error)) {
      throw new Error("Der manuelle Postausgang ist in Production noch nicht vollständig erweitert.")
    }
    throw error
  }

  const draft = toDraft(data as OutgoingMailQueueRow)
  if (!draft) throw new Error("Entwurf im Postausgang konnte nicht gelesen werden.")
  return draft
}

export async function getManualParentMailDrafts(limit = 200) {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("outgoing_mail_queue")
    .select("*")
    .eq("purpose", MANUAL_PARENT_MAIL_PURPOSE)
    .is("sent_at", null)
    .like("name", `${MANUAL_PARENT_MAIL_PREFIX}%`)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    if (isMissingContextKeyError(error)) return []
    throw error
  }

  return ((data as OutgoingMailQueueRow[] | null) ?? []).map(toDraft).filter((row): row is ManualParentMailDraft => Boolean(row))
}
