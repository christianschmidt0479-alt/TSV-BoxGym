# Inbound-Mail-System

## Zweck

Eingehende E-Mails an `info@tsvboxgym.de` werden automatisch per IMAP-Polling aus dem IONOS-Postfach importiert, in der Supabase-Datenbank gespeichert und im Adminbereich unter `/verwaltung/postfach` im Tab „Eingehend" angezeigt.

**Keine MX-Änderungen nötig** — das bestehende IONOS-Postfach wird direkt per IMAP abgefragt.

---

## Architektur

```
info@tsvboxgym.de (IONOS IMAP)
        ↓  (alle X Minuten per Cron)
POST /api/inbound-email/imap
        ↓  (imapflow + mailparser)
Supabase: inbound_emails
        ↓
Admin-UI: /verwaltung/postfach → Tab „Eingehend"
```

---

## Endpunkt

```
POST /api/inbound-email/imap
```

Wird **nicht** vom Browser aufgerufen, sondern per Cron-Job (Vercel Cron oder extern).

Authentifizierung: `x-cron-secret: <INBOUND_IMAP_SECRET>`

---

## Umgebungsvariablen

```
IMAP_HOST=imap.ionos.de
IMAP_PORT=993
IMAP_USER=info@tsvboxgym.de
IMAP_PASS=<ionos-passwort>
IMAP_SECURE=true
CRON_SECRET=<bereits für /api/admin-digest definiert>
```

> Die Auth-Variable `CRON_SECRET` ist project-weit geteilt mit dem Admin-Digest-Cron. Kein eigenes Secret nötig.

---

## Ablauf pro Aufruf

1. Auth-Prüfung via `x-cron-secret` Header
2. IMAP-Verbindung zu IONOS (TLS, Port 993)
3. Suche nach ungelesenen Mails im INBOX (`\Seen`-Flag nicht gesetzt)
4. Jede Mail wird via `mailparser` geparst (From, To, Subject, Text, HTML, Date, Message-ID)
5. Duplikat-Check via `message_id` — bereits importierte Mails werden übersprungen
6. Neuer Eintrag in `inbound_emails` (Supabase)
7. Mail als gelesen markieren (`\Seen` setzen) — nur nach erfolgreichem DB-Insert

---

## Datenbankstruktur

Tabelle: `inbound_emails` (Supabase)

| Spalte      | Typ         | Beschreibung                         |
|-------------|-------------|--------------------------------------|
| id          | uuid        | Primärschlüssel, auto-generated      |
| message_id  | text        | RFC 2822 Message-ID (Deduplizierung) |
| from_email  | text        | Absenderadresse                      |
| to_email    | text        | Empfängeradresse                     |
| subject     | text        | Betreff                              |
| text        | text        | Reiner Textinhalt                    |
| html        | text        | HTML-Inhalt                          |
| received_at | timestamptz | Sendedatum (aus Mail-Header)         |
| raw_headers | jsonb       | Alle Mail-Header als flaches Objekt  |

SQL-Migrationen:
- `supabase/inbound_emails.sql` — initiale Tabelle
- `supabase/inbound_emails_add_message_id.sql` — `message_id`-Spalte + Unique-Index

**Achtung:** Vor dem ersten Produktivbetrieb muss `inbound_emails_add_message_id.sql` in Supabase ausgeführt werden.

---

## Test per curl (lokal)

```bash
curl -X POST http://localhost:3000/api/inbound-email/imap \
  -H 'Authorization: Bearer <CRON_SECRET>'
```

Erwartete Antworten:

```json
// Keine neuen Mails
{ "ok": true, "processed": 0 }

// Mails importiert
{ "ok": true, "processed": 2, "checked": true }
```

---

## Cron-Konfiguration (Vercel)

Bereits in `vercel.json` eingetragen — alle 15 Minuten:

```json
{
  "crons": [
    { "path": "/api/inbound-email/imap", "schedule": "*/15 * * * *" }
  ]
}
```

Vercel sendet automatisch `Authorization: Bearer <CRON_SECRET>` mit jedem Cron-Request. Die Route akzeptiert genau dieses Format — kein externer Trigger nötig.

---

## Einzurichtende manuelle Schritte (Produktion)

1. **Supabase:** `supabase/inbound_emails_add_message_id.sql` ausführen
2. **Vercel:** IMAP-Variablen setzen (`IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASS`, `IMAP_SECURE=true`) — `CRON_SECRET` ist bereits gesetzt
3. **IONOS:** IMAP-Zugang für `info@tsvboxgym.de` aktiviert lassen (Standard)
4. **Cron:** Vercel Cron sendet automatisch `Authorization: Bearer <CRON_SECRET>` — kein weiterer Setup nötig

---

## Admin-UI

Tab „Eingehend" im Postfach (`/verwaltung/postfach`):
- Zeigt die letzten 50 eingehenden E-Mails
- Sortiert nach Eingangszeit absteigend
- Klick auf Eintrag zeigt Absender, Empfänger, Betreff, Datum und Textinhalt
- Nur für eingeloggte Admins sichtbar
