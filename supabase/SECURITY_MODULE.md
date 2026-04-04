# TSV BoxGym – KI-Sicherheitsmodul

Interne Dokumentation. Stand: April 2026.

---

## Überblick

Regelbasiertes Sicherheitsmodul ohne externe KI-Abhängigkeit. Erfasst sicherheitsrelevante Ereignisse, analysiert Muster, informiert den Admin per Mail und ermöglicht manuelle IP-Sperren über den Admin-Bereich.

Alle Maßnahmen sind **additiv** – kein Eingriff in bestehende Fachlogik, keine globale Middleware.

---

## Tabellenstruktur (Supabase)

| Tabelle                | Zweck                                              | SQL                            |
|------------------------|----------------------------------------------------|--------------------------------|
| `ai_security_events`   | Protokoll aller Sicherheitsereignisse              | ai_security_events.sql         |
| `ai_security_actions`  | Admin-Aktionen (geprüft, stumm, beobachtet, Notiz) | ai_security_actions.sql        |
| `ai_security_blocks`   | Manuelle IP-/Routen-Sperren mit Ablaufzeit         | ai_security_blocks.sql         |
| `admin_audit_log`      | Admin-Aktivitäten (Login, Sperren, Freigaben)      | admin_audit_log.sql            |
| `app_settings`         | Key/Value-Store für Einstellungen + Notif.-State   | (bestehendes Schema)           |

### Wichtige Constraints / Indizes
- `ai_security_blocks`: `UNIQUE(target_key) WHERE is_active = true` → nur eine aktive Sperre pro Ziel
- `ai_security_actions`: `UNIQUE(target_key, action_type)` → Upsert-Grundlage
- Alle Tabellen: Index auf `created_at DESC`

---

## Aktive Schutzmechanismen

| Mechanismus             | Wo                     | Auslöser                        |
|-------------------------|------------------------|---------------------------------|
| Rate-Limiting           | trainer-auth, admin-auth | > 5 Requests / 15 min / IP    |
| Login-Lock              | trainer-auth, admin-auth | > 10 Fehlversuche              |
| Manuelle IP-Sperre      | trainer-auth, admin-auth | Admin setzt Sperre im KI-Bereich |
| Security-Event-Logging  | alle Auth-Routen       | jeder kritische Vorgang         |
| Admin-Mail-Alerts       | Hintergrund            | kritische/warning Alerts        |

---

## Wo IP-Sperren aktiv geprüft werden

**Zwei Routen**, jeweils **vor** Rate-Limit und Credential-Check:

```
POST /api/trainer-auth  →  getActiveAiSecurityBlock(ip) → 403 wenn aktiv
POST /api/admin-auth    →  getActiveAiSecurityBlock(ip) → 403 wenn aktiv
```

Antwort bei Treffer:
- Mit Ablaufzeit: `"Zugriff vorübergehend gesperrt. Bitte später erneut versuchen."` (HTTP 403)
- Permanent: `"Zugriff gesperrt."` (HTTP 403)

**Keine Details** (kein Sperrgrund, keine DB-Infos) in der Antwort.

Fallback: Wenn `ai_security_blocks`-Tabelle fehlt oder DB ausfällt → Login läuft normal weiter.

---

## Event-Typen

| Typ                          | Bedeutung                                      | Schwere  |
|------------------------------|------------------------------------------------|----------|
| `login_failure`              | Fehlgeschlagener Login                         | medium/high |
| `login_lock`                 | Login-Lock nach zu vielen Fehlversuchen        | high     |
| `rate_limit`                 | Rate-Limit überschritten                       | medium   |
| `auth_denied`                | Zugriff auf geschützte Route verweigert        | medium   |
| `suspicious_request`         | Verdächtiger Request erkannt                   | medium   |
| `admin_security_action`      | Admin-Aktion im KI-Bereich                     | low      |
| `api_error_security_relevant`| Sicherheitsrelevanter API-Fehler               | medium   |
| `manual_block_hit`           | Anfrage an aktiver manueller IP-Sperre geblockt | high    |

---

## Admin-Funktionen im KI-Bereich (`/verwaltung/ki`)

- **Status**: KI-System, Brute-Force-Erkennung, Auto-Block, Benachrichtigung ein/aus
- **Sicherheitslage**: Gesamtrisiko, Kennzahlen (Ereignisse, Hoch/Mittel, letzter Vorfall)
- **Dashboard**: Trend-Verlauf (24h/7d/30d), Top-Routen, Top-IPs, Ereignistypen, Alert-Verlauf
- **Warnungen**: Aktive Alerts mit Aktionen (Geprüft, Stumm, Beobachten, Notiz)
- **Aktive Schutzmaßnahmen**: Liste aktiver Sperren mit Freigeben-Button
- **Benachrichtigungen**: Letzter Mail-Versand, Betreff, Cooldown-Info
- **Letzte Ereignisse**: Tabelle der letzten 20 Events
- **Einstellungen**: Toggle-Switches + Speichern

**IP sperren:** Im Dashboard → Top-IPs → „Sperren" → Dauer (15m / 1h / 24h / dauerhaft) + Grund wählen.

---

## Mail-Logik + Cooldown

- Versand via **Resend** (`RESEND_API_KEY`)
- Empfänger: `SECURITY_ALERT_EMAIL` → Fallback: `ADMIN_NOTIFICATION_EMAIL` → Fallback: `info@tsvboxgym.de`
- Cooldown: **30 Minuten** – gleicher Alert-Fingerprint wird nicht erneut versandt
- State wird in `app_settings` (Key: `ai_notification_state`) gespeichert
- Versand: fire-and-forget, Response bleibt intakt

---

## Bekannte Grenzen (bewusst)

- **Keine globale Middleware** – Sperren greifen nur in `trainer-auth` und `admin-auth`
- **Keine automatische Sperrung** – nur manuelle Sperren durch Admin
- **Keine Routen-Sperren aktiv** – Route-Sperren können verwaltet werden, haben aber keine harte Wirkung
- **Keine IPv6-Normalisierung** – IP wird so verwendet, wie sie vom Request kommt
- **Kein automatischer Cleanup** – abgelaufene Blocks werden bei Zugriff / Overview-Reload bereinigt
