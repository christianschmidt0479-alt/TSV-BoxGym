import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import { Readable } from "stream"
import { NextResponse } from "next/server"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------
type InsertRow = {
  message_id: string | null
  from_email: string
  to_email: string
  subject: string
  text: string
  html: string
  received_at: string
  raw_headers: Record<string, string> | null
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function getImapConfig() {
  const host = process.env.IMAP_HOST
  const port = parseInt(process.env.IMAP_PORT ?? "993", 10)
  const user = process.env.IMAP_USER
  const pass = process.env.IMAP_PASS
  const secure = (process.env.IMAP_SECURE ?? "true") !== "false"

  const missing = [
    !host && "IMAP_HOST",
    !user && "IMAP_USER",
    !pass && "IMAP_PASS",
  ].filter(Boolean)

  if (missing.length > 0) {
    return { error: `Missing ENV: ${missing.join(", ")}` as string, config: null }
  }

  return {
    error: null,
    config: {
      host: host as string,
      port,
      secure,
      auth: { user: user as string, pass: pass as string },
      logger: false as false,
      disableAutoIdle: true,
      connectionTimeout: 10000,
      socketTimeout: 90000,
    },
  }
}

function extractAddressString(addr: unknown): string {
  if (!addr) return ""
  // mailparser liefert AddressObject oder Array davon
  if (typeof addr === "object" && addr !== null) {
    const a = addr as Record<string, unknown>
    // Single AddressObject: {value: [{name, address}], text: "..."}
    if (typeof a.text === "string") return a.text
    // Array
    if (Array.isArray(a)) {
      return a
        .map((item: unknown) => {
          if (typeof item === "object" && item !== null) {
            const o = item as Record<string, unknown>
            if (typeof o.text === "string") return o.text
          }
          return ""
        })
        .filter(Boolean)
        .join(", ")
    }
  }
  return ""
}

// ---------------------------------------------------------------------------
// Import-Logik
// ---------------------------------------------------------------------------

async function fetchAndStoreNewMails(): Promise<{ imported: number; skipped: number }> {
  const { error: configError, config } = getImapConfig()
  if (configError || !config) {
    throw new Error(configError ?? "IMAP not configured")
  }

  const client = new ImapFlow(config)
  await client.connect()
  console.log("IMAP CONNECTED")

  let imported = 0
  let skipped = 0

  try {
    const lock = await client.getMailboxLock("INBOX")

    try {
      // Nur ungelesene Mails suchen
      const uids = await client.search({ seen: false }, { uid: true })
      const count = uids === false ? 0 : uids.length
      console.log("MAILS FOUND:", count)

      if (uids === false || uids.length === 0) {
        return { imported: 0, skipped: 0 }
      }

      const supabase = createServerSupabaseServiceClient()

      // Phase 1: Nur Envelope holen (schnell, kein Body-Download)
      const envelopes = await client.fetchAll(
        uids as number[],
        { envelope: true, uid: true },
        { uid: true }
      )

      // Prüfen welche Message-IDs bereits in DB sind
      const uidToMsgId = new Map<number, string | null>()
      for (const msg of envelopes) {
        uidToMsgId.set(msg.uid, msg.envelope?.messageId?.trim() ?? null)
      }

      const knownMsgIds = [...uidToMsgId.values()].filter(Boolean) as string[]
      let existingSet = new Set<string>()
      if (knownMsgIds.length > 0) {
        const { data } = await supabase
          .from("inbound_emails")
          .select("message_id")
          .in("message_id", knownMsgIds)
        existingSet = new Set((data ?? []).map((r) => r.message_id).filter(Boolean))
      }

      // Duplikate sofort als Seen markieren — kein Body-Download nötig
      const dupUids: number[] = []
      const newUids: number[] = []
      for (const [uid, msgId] of uidToMsgId) {
        if (msgId && existingSet.has(msgId)) {
          dupUids.push(uid)
        } else {
          newUids.push(uid)
        }
      }

      if (dupUids.length > 0) {
        const flagged = await client.messageFlagsAdd(dupUids, ["\\Seen"], { uid: true })
        if (!flagged) {
          console.warn("IMAP WARN: messageFlagsAdd (dedup) returned false for UIDs", dupUids)
        }
        skipped += dupUids.length
      }

      // Phase 2: Nur für neue Mails den vollen Body holen
      if (newUids.length > 0) {
        for await (const msg of client.fetch(newUids, { source: true, flags: true }, { uid: true })) {
          const uid = msg.uid

          let parsed
          try {
            const sourceBuffer = msg.source
            if (!sourceBuffer || sourceBuffer.length === 0) {
              console.warn("IMAP WARN: Empty source for UID", uid)
              skipped++
              continue
            }
            const readable = Readable.from(sourceBuffer)
            parsed = await simpleParser(readable)
          } catch (parseError) {
            console.error("IMAP ERROR: Parse error for UID", uid, parseError)
            skipped++
            continue
          }

          const messageId = typeof parsed.messageId === "string" ? parsed.messageId.trim() : null
          const from_email = extractAddressString(parsed.from)
          const to_email = extractAddressString(parsed.to)
          const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : ""
          const text = typeof parsed.text === "string" ? parsed.text.trim() : ""
          const html = typeof parsed.html === "string" ? parsed.html.trim() : ""
          const received_at =
            parsed.date instanceof Date ? parsed.date.toISOString() : new Date().toISOString()

          // Headers als flaches Objekt speichern
          let raw_headers: Record<string, string> | null = null
          if (parsed.headers && typeof parsed.headers.get === "function") {
            const headersObj: Record<string, string> = {}
            for (const [key] of parsed.headers) {
              const val = parsed.headers.get(key)
              headersObj[key] = Array.isArray(val) ? val.join(", ") : String(val ?? "")
            }
            raw_headers = headersObj
          }

          const row: InsertRow = {
            message_id: messageId,
            from_email,
            to_email,
            subject,
            text,
            html,
            received_at,
            raw_headers,
          }

          const { error: insertError } = await supabase.from("inbound_emails").insert(row)

          if (insertError) {
            console.error("IMAP ERROR: DB insert failed for UID", uid, insertError)
            // Nicht als gelesen markieren — beim nächsten Lauf erneut versuchen
            skipped++
            continue
          }

          // Erst nach erfolgreichem Insert als gelesen markieren
          const flagged = await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })
          if (!flagged) {
            console.warn("IMAP WARN: messageFlagsAdd returned false for UID", uid)
          }
          imported++
          console.log("IMAP IMPORTED: mail from", from_email, "subject:", subject)
        }
      }
    } finally {
      lock.release()
    }
  } finally {
    try {
      await client.logout()
    } catch {
      // Verbindung war bereits getrennt — kein Fehler
    }
  }

  return { imported, skipped }
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // --- Auth-Check ---
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("IMAP ERROR: CRON_SECRET not configured")
    return jsonError("Service not configured", 503)
  }

  const auth = request.headers.get("authorization")
  if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== cronSecret) {
    console.warn("IMAP ERROR: Unauthorized request rejected")
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // --- Import ---
  console.log("IMAP START")
  try {
    const result = await fetchAndStoreNewMails()
    console.log("IMPORTED:", result.imported)
    if (result.imported === 0 && result.skipped === 0) {
      return NextResponse.json({ ok: true, processed: 0 })
    }
    return NextResponse.json({ ok: true, processed: result.imported, checked: true })
  } catch (error) {
    console.error("IMAP ERROR", error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export function GET() {
  return jsonError("Method not allowed", 405)
}

export function PUT() {
  return jsonError("Method not allowed", 405)
}

export function PATCH() {
  return jsonError("Method not allowed", 405)
}

export function DELETE() {
  return jsonError("Method not allowed", 405)
}
