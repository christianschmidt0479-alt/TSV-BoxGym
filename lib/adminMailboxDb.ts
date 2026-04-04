import { randomUUID } from "crypto"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { type AdminMailboxRecord, createMailboxSnippet, buildReplySubject } from "@/lib/adminMailbox"
import { validateEmail } from "@/lib/formValidation"
import { getAdminNotificationAddress, getReplyToAddress } from "@/lib/mailConfig"
import { getManualAdminMailDrafts } from "@/lib/manualAdminMailOutboxDb"
import { getManualParentMailDrafts } from "@/lib/manualParentMailOutboxDb"
import { sendCustomEmail } from "@/lib/resendClient"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

const LEGACY_INBOX_PREFIX = "legacy-inbox:"
const LEGACY_ADMIN_DRAFT_PREFIX = "legacy-draft-admin:"
const LEGACY_PARENT_DRAFT_PREFIX = "legacy-draft-parent:"

type AdminMailboxDbRow = {
  id: string
  sender: string | null
  recipient: string | null
  subject: string | null
  snippet: string | null
  content: string | null
  status: AdminMailboxRecord["status"] | null
  type: AdminMailboxRecord["type"] | null
  created_at: string
}

type AdminNotificationQueueRow = {
  id: string
  kind: "member" | "trainer" | "boxzwerge"
  member_name: string
  email: string | null
  group_name: string | null
  created_at: string
  sent_at: string | null
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

function isMissingMailboxTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return error?.code === "PGRST205" || message.includes("admin_mailbox") || message.includes("could not find the table")
}

function isMissingSchemaEntity(error: { message?: string; details?: string; code?: string } | null, name?: string) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  const looksMissing =
    error?.code === "PGRST204" ||
    error?.code === "42P01" ||
    error?.code === "42703" ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("schema cache")

  if (!looksMissing) return false
  if (!name) return true
  return message.includes(name.toLowerCase())
}

function mapDbRow(row: AdminMailboxDbRow): AdminMailboxRecord {
  return {
    id: row.id,
    from: row.sender?.trim() || "",
    to: row.recipient?.trim() || "",
    subject: row.subject?.trim() || "Ohne Betreff",
    snippet: row.snippet?.trim() || createMailboxSnippet(row.content || ""),
    content: row.content || "",
    status: row.status || "open",
    type: row.type || "inbox",
    created_at: row.created_at,
  }
}

function mapRecordToDbRow(record: AdminMailboxRecord): AdminMailboxDbRow {
  return {
    id: record.id,
    sender: record.from.trim() || null,
    recipient: record.to.trim() || null,
    subject: record.subject.trim() || null,
    snippet: createMailboxSnippet(record.content),
    content: record.content,
    status: record.status,
    type: record.type,
    created_at: record.created_at,
  }
}

function sortByCreatedAtDesc(left: AdminMailboxRecord, right: AdminMailboxRecord) {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
}

function getInboxSubject(row: AdminNotificationQueueRow) {
  switch (row.kind) {
    case "member":
      return `Neue Mitgliederanfrage: ${row.member_name}`
    case "trainer":
      return `Traineranfrage offen: ${row.member_name}`
    case "boxzwerge":
      return `Boxzwerge-Hinweis: ${row.member_name}`
  }
}

function getInboxContent(row: AdminNotificationQueueRow) {
  const parts = [
    `Typ: ${row.kind}`,
    `Name: ${row.member_name}`,
    row.email ? `E-Mail: ${row.email}` : null,
    row.group_name ? `Gruppe: ${row.group_name}` : null,
    "Dieser Eintrag stammt aus der bestehenden Admin-Warteschlange und wurde fuer das neue Postfach aufbereitet.",
  ].filter(Boolean)

  return parts.join("\n")
}

async function getStoredMailboxRows() {
  const supabase = getServerSupabase()
  const response = await supabase.from("admin_mailbox").select("*").order("created_at", { ascending: false })

  if (response.error) {
    if (isMissingMailboxTableError(response.error)) return []
    throw response.error
  }

  return ((response.data as AdminMailboxDbRow[] | null) ?? []).map(mapDbRow)
}

async function getLegacyInboxRows() {
  const supabase = getServerSupabase()
  const response = await supabase
    .from("admin_notification_queue")
    .select("id, kind, member_name, email, group_name, created_at, sent_at")
    .is("sent_at", null)
    .order("created_at", { ascending: false })

  if (response.error) {
    if (isMissingSchemaEntity(response.error, "admin_notification_queue")) return []
    throw response.error
  }

  return ((response.data as AdminNotificationQueueRow[] | null) ?? []).map((row) => {
    const content = getInboxContent(row)
    return {
      id: `${LEGACY_INBOX_PREFIX}${row.id}`,
      from: row.email?.trim() || `${row.kind}@tsvboxgym.local`,
      to: getAdminNotificationAddress(),
      subject: getInboxSubject(row),
      snippet: createMailboxSnippet(content),
      content,
      status: "open",
      type: "inbox",
      created_at: row.created_at,
    } satisfies AdminMailboxRecord
  })
}

async function getLegacyDraftRows() {
  const [manualAdminDrafts, manualParentDrafts] = await Promise.all([getManualAdminMailDrafts(), getManualParentMailDrafts()])

  const adminDraftRows: AdminMailboxRecord[] = manualAdminDrafts.map((row) => ({
    id: `${LEGACY_ADMIN_DRAFT_PREFIX}${row.id}`,
    from: getReplyToAddress(),
    to: row.to,
    subject: row.subject,
    snippet: createMailboxSnippet(row.body),
    content: row.body,
    status: "draft",
    type: "draft",
    created_at: row.created_at,
  }))

  const parentDraftRows: AdminMailboxRecord[] = manualParentDrafts.map((row) => ({
    id: `${LEGACY_PARENT_DRAFT_PREFIX}${row.id}`,
    from: getReplyToAddress(),
    to: row.parent_email,
    subject: row.subject,
    snippet: createMailboxSnippet(row.body),
    content: row.body,
    status: "draft",
    type: "draft",
    created_at: row.created_at,
  }))

  return [...adminDraftRows, ...parentDraftRows]
}

async function getMergedMailboxRecords() {
  const [storedRows, legacyInboxRows, legacyDraftRows] = await Promise.all([getStoredMailboxRows(), getLegacyInboxRows(), getLegacyDraftRows()])
  const merged = new Map<string, AdminMailboxRecord>()

  for (const row of [...legacyInboxRows, ...legacyDraftRows]) {
    merged.set(row.id, row)
  }

  for (const row of storedRows) {
    merged.set(row.id, row)
  }

  return Array.from(merged.values()).sort(sortByCreatedAtDesc)
}

async function persistMailboxRecord(record: AdminMailboxRecord) {
  const supabase = getServerSupabase()
  const payload = mapRecordToDbRow({
    ...record,
    snippet: createMailboxSnippet(record.content),
  })

  const response = await supabase.from("admin_mailbox").upsert([payload]).select("*").single()

  if (response.error) {
    if (isMissingMailboxTableError(response.error)) {
      throw new Error("Die Tabelle admin_mailbox fehlt. Bitte supabase/admin_mailbox.sql ausführen.")
    }
    throw response.error
  }

  return mapDbRow(response.data as AdminMailboxDbRow)
}

async function markLegacyDraftSourceAsSent(mailboxId: string) {
  const sourceId = mailboxId.startsWith(LEGACY_ADMIN_DRAFT_PREFIX)
    ? mailboxId.slice(LEGACY_ADMIN_DRAFT_PREFIX.length)
    : mailboxId.startsWith(LEGACY_PARENT_DRAFT_PREFIX)
      ? mailboxId.slice(LEGACY_PARENT_DRAFT_PREFIX.length)
      : ""

  if (!sourceId) return

  const supabase = getServerSupabase()
  const { error } = await supabase.from("outgoing_mail_queue").update({ sent_at: new Date().toISOString() }).eq("id", sourceId)

  if (error && !isMissingSchemaEntity(error, "outgoing_mail_queue")) {
    throw error
  }
}

function buildReplyBody(source: AdminMailboxRecord) {
  const fallbackSummary = source.snippet || createMailboxSnippet(source.content)
  return `Hallo,\n\nvielen Dank für deine Nachricht.\n\nIch habe folgenden Punkt aufgenommen:\n${fallbackSummary}\n\nIch melde mich zeitnah mit einer Rückmeldung.\n\nSportliche Grüße\nTSV BoxGym`
}

export async function listAdminMailboxRecords() {
  return getMergedMailboxRecords()
}

export async function getAdminMailboxRecord(id: string) {
  const rows = await getMergedMailboxRecords()
  return rows.find((row) => row.id === id) ?? null
}

export async function updateAdminMailboxRecord(id: string, patch: Partial<Pick<AdminMailboxRecord, "from" | "to" | "subject" | "content" | "status" | "type">>) {
  const current = await getAdminMailboxRecord(id)
  if (!current) {
    throw new Error("Mailbox-Eintrag nicht gefunden.")
  }

  const nextPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<Pick<AdminMailboxRecord, "from" | "to" | "subject" | "content" | "status" | "type">>

  return persistMailboxRecord({
    ...current,
    ...nextPatch,
    snippet: createMailboxSnippet(nextPatch.content ?? current.content),
  })
}

export async function createAdminMailboxReplyDraft(sourceId: string) {
  const source = await getAdminMailboxRecord(sourceId)
  if (!source) {
    throw new Error("Nachricht für Antwort nicht gefunden.")
  }

  return persistMailboxRecord({
    id: randomUUID(),
    from: getReplyToAddress(),
    to: source.from,
    subject: buildReplySubject(source.subject),
    snippet: createMailboxSnippet(buildReplyBody(source)),
    content: buildReplyBody(source),
    status: "draft",
    type: "draft",
    created_at: new Date().toISOString(),
  })
}

export async function sendAdminMailboxDraft(input: {
  id: string
  session: Parameters<typeof writeAdminAuditLog>[0]["session"]
}) {
  const record = await getAdminMailboxRecord(input.id)
  if (!record) {
    throw new Error("Entwurf nicht gefunden.")
  }

  if (record.type !== "draft") {
    throw new Error("Nur Entwürfe können gesendet werden.")
  }

  if (record.status !== "draft") {
    throw new Error("Der Entwurf wurde bereits verarbeitet.")
  }

  const emailValidation = validateEmail(record.to)
  if (!emailValidation.valid) {
    throw new Error(emailValidation.error || "Ungültige E-Mail-Adresse.")
  }

  const delivery = await sendCustomEmail({
    to: record.to,
    subject: record.subject,
    text: record.content,
    replyTo: record.from || undefined,
  })

  if (record.id.startsWith(LEGACY_ADMIN_DRAFT_PREFIX) || record.id.startsWith(LEGACY_PARENT_DRAFT_PREFIX)) {
    await markLegacyDraftSourceAsSent(record.id)
  }

  const nextRecord = await persistMailboxRecord({
    ...record,
    status: "sent",
  })

  await writeAdminAuditLog({
    session: input.session,
    action: "admin_mailbox_send",
    targetType: "admin_mailbox",
    targetId: nextRecord.id,
    targetName: nextRecord.subject,
    details: `${nextRecord.to}${delivery.messageId ? ` · Resend ${delivery.messageId}` : ""}`,
  })

  return {
    record: nextRecord,
    delivery,
  }
}