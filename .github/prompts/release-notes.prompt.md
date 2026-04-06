---
description: "Release-Notes und CHANGELOG-Eintrag für die nächste Version generieren"
agent: "agent"
argument-hint: "Optional: Ziel-Versionsnummer (z.B. 4.7.0)"
---

Erstelle Release-Notes und einen CHANGELOG-Eintrag für das nächste Release dieses Projekts.

## Schritt 1 – Commits seit letztem Release ermitteln

Führe `git log $(git describe --tags --abbrev=0)..HEAD --oneline` aus.
Falls kein Tag existiert, nutze stattdessen `git log --oneline -30`.

## Schritt 2 – Aktuelle Version lesen

Lies die `version`-Zeile aus `package.json`.

## Schritt 3 – Neue Version bestimmen

Wende Semantic Versioning an:
- `feat(...)` ohne Breaking Change → Minor-Bump (x.**Y**.0)
- Nur `fix(...)`, `chore(...)`, `style(...)` → Patch-Bump (x.y.**Z**)
- Breaking Change (explizit im Commit) → Major-Bump (**X**.0.0)

Falls der Nutzer eine Versionsnummer als Argument übergeben hat, verwende diese.

## Schritt 4 – Release-Notes ausgeben

Gib folgendes aus – **auf Deutsch**, kein Code-Block-Wrapper:

---

### Release v<VERSION> — <Datum heute>

#### Neue Features
- <Kurzbeschreibung, ein Bullet pro feat-Commit>

#### Bugfixes
- <Kurzbeschreibung, ein Bullet pro fix-Commit>

#### Sonstiges
- <chore / ci / refactor / style falls vorhanden>

---

Danach gib den fertigen **CHANGELOG-Eintrag** im Keep-a-Changelog-Format aus:

```
## [<VERSION>] - <YYYY-MM-DD>

### Added
- ...

### Fixed
- ...

### Changed
- ...
```

## Regeln

- Deutsch in allen Beschreibungen (außer Code-Bezeichner)
- Keine internen Implementierungsdetails die Nutzer nicht interessieren
- Commits ohne Scope (`fix: ...`, `chore: ...`) unter „Sonstiges" einordnen
- Nur Commits einbeziehen die seit dem letzten Release neu sind
