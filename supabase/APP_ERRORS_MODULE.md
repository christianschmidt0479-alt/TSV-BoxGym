# APP_ERRORS_MODULE.md — Technisches Fehlermodul

## Zweck

Zentrales Modul zur Erfassung, Speicherung, Anzeige und Benachrichtigung
bei technischen App-Fehlern in der TSV BoxGym App.

Dieses Modul ist bewusst additiv — es verändert keine bestehende Fachlogik,
keine Security-Logik und keine bestehenden Flows.

---

## Tabellenstruktur: public.app_errors

| Feld             | Typ        | Beschreibung                              |
|------------------|------------|-------------------------------------------|
| id               | uuid       | Primärschlüssel                           |
| created_at       | timestamptz| Erstellungszeitpunkt                      |
| updated_at       | timestamptz| Letztes Update                            |
| source           | text       | Systembereich (mail, auth, checkin, …)    |
| route            | text       | Betroffene API-Route (optional)           |
| error_type       | text       | Fehlerklasse (send_failed, …)             |
| severity         | text       | low/medium/high/critical                  |
| message          | text       | Normalisierte Fehlermeldung (max 500Z)    |
| details          | text       | Sanitierte Details (max 2000Z, optional)  |
| actor            | text       | Auslösender Actor (optional)              |
| actor_role       | text       | Rolle des Actors (optional)               |
| ip               | text       | IP-Adresse (optional, nur wenn nötig)     |
| fingerprint      | text       | Stabiler Hash für Upsert-Zusammenfassung  |
| status           | text       | open/acknowledged/resolved/ignored        |
| note             | text       | Interne Admin-Notiz (optional)            |
| first_seen_at    | timestamptz| Erstmaliges Auftreten                     |
| last_seen_at     | timestamptz| Letztes Auftreten                         |
| occurrence_count | integer    | Anzahl der Auftritte (Upsert-Zähler)      |

---

## Statusmodell

| Status       | Bedeutung                                       |
|--------------|-------------------------------------------------|
| open         | Neuer, unbearbeiteter Fehler                    |
| acknowledged | Wurde geprüft, Ursache bekannt                 |
| resolved     | Behoben                                         |
| ignored      | Bewusst ignoriert (kein Handlungsbedarf)       |

---

## Severity-Modell

| Severity  | Bedeutung                                           |
|-----------|-----------------------------------------------------|
| low       | Unkritischer Hinweis, kaum Auswirkung               |
| medium    | Funktionale Beeinträchtigung, kein Ausfall          |
| high      | Wichtiger Fehler, manuell prüfen                   |
| critical  | Kritischer Fehler → sofortige Mail an Admin         |

---

## Eigener Menüpunkt

- **Navigation**: Admin-Leiste → Sektion „System" → „Fehler"
- **Route**: /verwaltung/fehler
- **Sichtbar**: nur für Admins
- **Dateien**: 
  - `components/admin-top-nav.tsx` (Desktop)
  - `app/verwaltung/layout.tsx` (Mobile)

---

## Bereiche, die aktiv Fehler melden

| Bereich                        | Quelle       | Typ                    | Severity |
|-------------------------------|--------------|------------------------|----------|
| Trainer-Login (unexpected)    | auth         | unexpected_auth_error  | high     |
| Admin-Mail-Send (PUT)         | mail         | send_failed            | high     |
| KI-Security-Übersicht (GET)   | ai_security  | overview_failed        | medium   |

---

## Bereiche, die bewusst NICHT melden

- Normale falsche Passwörter / Pins → das ist Security-Event, nicht App-Fehler
- Rate-Limit-Treffer → werden von aiSecurityEventsDb erfasst
- Normale 401/403-Responses → keine App-Fehler
- Datenbankfehler in resendClient intern → wirft, Caller fängt
- Member-Area-Login-Fehler bei falschen Eingaben → kein technischer Fehler

---

## Mail-Benachrichtigung

- Empfänger: `ADMIN_NOTIFICATION_EMAIL` (aus Umgebungsvariable, default: info@tsvboxgym.de)
- Auslösung: nur bei `severity = critical`
- Cooldown: 1 Stunde pro Fingerprint (in-memory)
- Inhalt: Quelle, Typ, Meldung, Anzahl, Link zu /verwaltung/fehler
- Kein sensitiver Inhalt in der Mail

**Hinweis**: In serverlosen Umgebungen (Vercel) verliert der In-Memory-Cooldown seinen Zustand
bei Cold Starts. Das ist bewusst akzeptiert — lieber eine gelegentliche Doppelmail als keine.

---

## Fingerprint-Logik

Gleiche Fehler werden anhand von `source|route|error_type|normalized_message` identifiziert.
Normalisierung: UUIDs, IDs und Timestamps werden durch Platzhalter ersetzt.
Innerhalb eines 7-Tage-Fensters bei offenem/geprüftem Status: Upsert statt neuer Eintrag.

---

## Datenschutz / Sicherheit

- Keine Passwörter, Tokens, JWTs, API-Keys in Details gespeichert
- Sensitiver Inhalt wird mit `[redacted]` ersetzt
- Details max. 2000 Zeichen
- Message max. 500 Zeichen
- IP nur optional und wo sinnvoll
- Zugriff: nur Service-Role und Admin-Benutzer

---

## Grenzen des Systems

- Kein Ersatz für externes Monitoring (Sentry, Datadog o.Ä.)
- Kein automatischer Eingriff in laufende Prozesse
- Keine vollständige globale Error-Interception
- KI-Analyse ist regelbasiert, kein LLM-Einsatz
- Tabelle wächst ungebremst — gelegentliches manuelles Aufräumen empfohlen
