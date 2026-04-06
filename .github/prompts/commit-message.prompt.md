---
description: "Conventional-Commit-Message für staged Changes generieren"
agent: "agent"
argument-hint: "Optional: Kurzbeschreibung was geändert wurde"
---

Analysiere die aktuell gestagten Git-Änderungen und generiere eine Commit-Message nach der Projektkonvention.

## Schritt 1 – Änderungen ermitteln

Führe `git diff --cached --stat` und `git diff --cached` aus, um die gestagten Änderungen zu sehen.

## Schritt 2 – Commit-Message erstellen

Halte dich strikt an folgendes Format:

```
<type>(<scope>): <subject>

- <Änderung 1>
- <Änderung 2>
- ...
```

### Erlaubte Types

| Type | Wann |
|------|------|
| `feat` | Neue Funktion oder sichtbares Feature |
| `fix` | Bugfix |
| `chore` | Versionsbump, Konfiguration, Build |
| `ci` | GitHub Actions, Vercel-Config |
| `refactor` | Codeumbau ohne Funktionsänderung |
| `style` | Nur visuelle/CSS-Änderungen |
| `docs` | Dokumentation |
| `test` | Tests |

### Scopes (Projektspezifisch)

Verwende den logischen Bereich der Änderung als Scope, z. B.:
`postfach`, `admin`, `mitglieder`, `trainer`, `auth`, `cron`, `qr`, `vercel`, `db`

### Regeln

- Subject: max. 72 Zeichen, **Deutsch**, kein Punkt am Ende
- Body-Bullets: nur wenn mehrere unabhängige Änderungen; sonst weglassen
- Kein Breaking-Change-Footer, außer es ist tatsächlich ein Breaking Change
- Kein Englisch im Subject oder Body (außer Bezeichner wie `route.ts`, Tabellennamen etc.)

## Schritt 3 – Ausgabe

Gib **nur die fertige Commit-Message** aus, ohne Erklärung, ohne Codeblock-Wrapper – direkt kopierbar.
