import type { AdminMailDraftRequest } from "@/lib/adminMailComposer"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

const MANUAL_ADMIN_MAIL_PREFIX = "manual_admin_mail:"
const MANUAL_ADMIN_MAIL_PURPOSE = "competition_assigned"

export type ManualAdminMailDraft = {
  id: string
  kind: AdminMailDraftRequest["kind"]
  to: string
  name: string | null
  subject: string
  body: string
  request: AdminMailDraftRequest
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

function encodePayload(payload: Omit<ManualAdminMailDraft, "id" | "created_at">) {
  return `${MANUAL_ADMIN_MAIL_PREFIX}${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`
}

function decodePayload(row: Pick<OutgoingMailQueueRow, "name" | "context_key">) {
  const encodedValue = row.name?.startsWith(MANUAL_ADMIN_MAIL_PREFIX) ? row.name : row.context_key
  if (!encodedValue || !encodedValue.startsWith(MANUAL_ADMIN_MAIL_PREFIX)) return null

  try {
    const raw = encodedValue.slice(MANUAL_ADMIN_MAIL_PREFIX.length)
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Omit<ManualAdminMailDraft, "id" | "created_at">
  } catch {
    return null
  }
}

export function isManualAdminMailRecord(input: { name?: string | null; context_key?: string | null }) {
  return Boolean(input.name?.startsWith(MANUAL_ADMIN_MAIL_PREFIX) || input.context_key?.startsWith(MANUAL_ADMIN_MAIL_PREFIX))
}

function toDraft(row: OutgoingMailQueueRow): ManualAdminMailDraft | null {
  const payload = decodePayload(row)
  if (!payload) return null

  return {
    id: row.id,
    kind: payload.kind,
    to: payload.to,
    name: payload.name ?? null,
    subject: payload.subject,
    body: payload.body,
    request: payload.request,
    created_at: row.created_at,
  }
}

export async function upsertManualAdminMailDraft(input: {
  to: string
  name?: string | null
  subject: string
  body: string
  request: AdminMailDraftRequest
}) {
  const supabase = getServerSupabase()
  const normalizedEmail = input.to.trim().toLowerCase()
  const encodedPayload = encodePayload({
    kind: input.request.kind,
    to: normalizedEmail,
    name: input.name?.trim() || null,
    subject: input.subject.trim(),
    body: input.body,
    request: input.request,
  })

  const existing = await supabase
    .from("outgoing_mail_queue")
    .select("*")
    .eq("purpose", MANUAL_ADMIN_MAIL_PURPOSE)
    .eq("email", normalizedEmail)
    .like("name", `${MANUAL_ADMIN_MAIL_PREFIX}%`)
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
        purpose: MANUAL_ADMIN_MAIL_PURPOSE,
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

export async function getManualAdminMailDrafts(limit = 200) {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("outgoing_mail_queue")
    .select("*")
    .is("sent_at", null)
    .like("name", `${MANUAL_ADMIN_MAIL_PREFIX}%`)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    if (isMissingContextKeyError(error)) return []
    throw error
  }

  return ((data as OutgoingMailQueueRow[] | null) ?? []).map(toDraft).filter((row): row is ManualAdminMailDraft => Boolean(row))
}

export async function convertQueueItemToAdminDraft(
  itemId: string,
  payload: {
    kind: AdminMailDraftRequest["kind"]
    to: string
    name: string | null
    subject: string
    body: string
    request: AdminMailDraftRequest
  }
) {
  const supabase = getServerSupabase()
  const encoded = encodePayload(payload)

  const { data, error } = await supabase
    .from("outgoing_mail_queue")
    .update({ name: encoded })
    .eq("id", itemId)
    .select("*")
    .single()

  if (error) throw error

  const draft = toDraft(data as OutgoingMailQueueRow)
  if (!draft) throw new Error("Queue-Eintrag konnte nicht in Admin-Entwurf umgewandelt werden.")
  return draft
}