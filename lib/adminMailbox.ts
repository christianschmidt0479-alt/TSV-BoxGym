export type AdminMailboxStatus = "open" | "draft" | "done" | "sent" | "deleted"

export type AdminMailboxType = "inbox" | "draft"

export type AdminMailboxRecord = {
  id: string
  from: string
  to: string
  subject: string
  snippet: string
  content: string
  status: AdminMailboxStatus
  type: AdminMailboxType
  created_at: string
}

export function createMailboxSnippet(content: string, maxLength = 180) {
  const normalized = content.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function buildReplySubject(subject: string) {
  const normalized = subject.trim()
  if (!normalized) return "Re: Nachricht"
  return /^re:/i.test(normalized) ? normalized : `Re: ${normalized}`
}

export function getMailboxStatusLabel(status: AdminMailboxStatus) {
  switch (status) {
    case "open":
      return "Offen"
    case "draft":
      return "Entwurf"
    case "done":
      return "Erledigt"
    case "sent":
      return "Gesendet"
    case "deleted":
      return "Gelöscht"
  }
}

export function getMailboxTypeLabel(type: AdminMailboxType) {
  switch (type) {
    case "inbox":
      return "Eingang"
    case "draft":
      return "Entwurf"
  }
}