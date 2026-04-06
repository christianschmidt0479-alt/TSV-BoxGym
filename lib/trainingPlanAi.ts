// ─── Typen ────────────────────────────────────────────────────────────────────

export type TrainingPlanDrill = {
  name: string
  description: string
  duration_hint?: string
}

export type TrainingPlanBlock = {
  name: string
  duration_minutes: number
  objective: string
  setup: string
  drills: TrainingPlanDrill[]
  coaching_points: string[]
  scaling: string
}

export type GeneratedTrainingPlan = {
  title: string
  summary: string
  target_group: string
  training_goal: string
  organization_notes: string
  blocks: TrainingPlanBlock[]
  safety_notes: string
  equipment_needed: string[]
}

export type TrainingPlanInput = {
  date: string
  group_key: string
  training_time?: string | null
  age_group?: string | null
  performance_level?: string | null
  participant_count?: number | null
  trainer_count?: number | null
  duration_minutes?: number | null
  training_goal?: string | null
  training_focus?: string | null
  training_mode?: string | null
  sparring_allowed: boolean
  ring_available: boolean
  ai_context?: string | null
  // Planmodus (Einzelplan / Kombiplan / Folgeplan)
  plan_type?: "single" | "combo" | "followup" | null
  secondary_group_key?: string | null
  is_holiday_combined?: boolean | null
  // Für Folgeplan: Kontext des Vorgängerplans
  based_on_plan_title?: string | null
  based_on_plan_summary?: string | null
  // Vorlage als strukturierender Ausgangspunkt
  template_name?: string | null
  template_plan_type?: "single" | "combo" | "followup" | null
  template_title?: string | null
  template_summary?: string | null
  template_training_goal?: string | null
}

// Gym-Kontext aus dem Basisprofil (serverseitig eingebunden, nicht vom Nutzer steuerbar)
export type GymContext = {
  has_ring: boolean
  ring_often_available: boolean
  heavy_bags_count: number
  mitts_pairs_count: number
  jump_ropes_count: number
  medicine_balls_count: number
  max_group_size: number
  space_description: string
  training_principles: string
  group_characteristics: string
}

// ─── OpenAI-Konfiguration ─────────────────────────────────────────────────────

const OPENAI_TIMEOUT_MS = 30_000

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || ""
}

function getOpenAiModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini"
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

type OpenAiResponsePayload = {
  output_text?: string
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

function extractOpenAiText(payload: OpenAiResponsePayload): string {
  if (typeof payload.output_text === "string") {
    const t = payload.output_text.trim()
    if (t) return t
  }

  if (!Array.isArray(payload.output)) return ""

  const chunks = payload.output.flatMap((entry) => {
    if (!Array.isArray(entry.content)) return []
    return entry.content
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => (item.text ?? "").trim())
      .filter(Boolean)
  })

  return chunks.join("\n\n").trim()
}

// ─── Systemprompt ─────────────────────────────────────────────────────────────

/**
 * Methodischer Leitrahmen für den TSV BoxGym Trainingsstandard.
 *
 * Prioritätsreihenfolge (fest):
 *   1. Trainingsmodus  → bestimmt Charakter, Tempo und Komplexität der Einheit
 *   2. Technischer Fokus → bestimmt den inhaltlichen roten Faden durch alle Blöcke
 *   3. Allgemeines Trainingsziel / Freitext → ergänzende Orientierung
 *   4. KI-Kontext / Rahmenbedingungen → situative Überlagerung einzelner Punkte
 *   5. BoxGym-Basisprofil → verbindlicher Hintergrundrahmen
 */
const BASE_SYSTEM_PROMPT = `Du bist Trainingsplaner beim TSV Falkensee BoxGym im olympischen Boxen.
Du erstellst praxistaugliche Trainingspläne für echte Trainer im Vereinstraining.
Deine Pläne sind realistisch, sicherheitsbewusst und methodisch sauber aufgebaut.
Antworte ausschließlich als valides JSON ohne Markdown-Formatierung oder Erklärungstext.

═══════════════════════════════════════════════════
FACHLICHE GRUNDREGELN
═══════════════════════════════════════════════════

Disziplin:
- Ausschließlich olympisches Boxen
- Technik: Jab, Cross, Hook, Uppercut, Deckung, Beinarbeit, Kombinationen, Sparring
- Keine Mischung mit anderen Kampfsportarten
- Keine unrealistischen oder theoretischen Übungen

Praxisrealität im TSV BoxGym:
- Pläne müssen mit vorhandenem Material umsetzbar sein
- Niemals mehr Gerätestationen als physisch vorhanden
- Bei Geräteknappheit: Rotationsstationen oder körpergewichtsbasierte Partnerübungen
- Ringe: nur nutzen wenn explizit als verfügbar angegeben

Sicherheit:
- Handschuhe und Bandagen vorher prüfen
- Beim Sparring ausschließlich mit ausreichendem Schutzmaterial
- Erschöpfungszeichen bei Jugend früh erkennen, Pause einleiten
- Jugendliche nie in Vollkontakt-Situationen ohne ausreichende Erfahrung

═══════════════════════════════════════════════════
METHODISCHER STANDARD – AUFBAU EINER EINHEIT
═══════════════════════════════════════════════════

Jede Einheit folgt dieser Phasenstruktur (Standard – situativ anpassbar):

Phase 1 – ERWÄRMUNG (ca. 15–20 % der Gesamtzeit)
  Ziel: Körper und Geist auf Boxtraining vorbereiten
  Inhalt: Allgemeine Aktivierung (Seil, Laufen, Koordination) +
          boxspezifische Aufwärmformen (Schattboxen, Footwork, leichte Partnerarbeit)
  Prinzip: Intensität steigert sich von locker zu boxbereit
  Anfänger/Kinder: spielerische Formen, kurze Blöcke, wechselnde Aktivitäten

Phase 2 – TECHNIK (ca. 20–25 % der Gesamtzeit)
  Ziel: Einführung oder Vertiefung des technischen Schwerpunkts der Einheit
  Inhalt: Isoliertes Üben der Kerntechnik, zuerst ohne Partner oder im Spiegel,
          dann in kontrollierten Partnerformen (z. B. gemeinsames Schattboxen)
  Prinzip: Technik vor Intensität – korrekte Ausführung hat absoluten Vorrang
  Anfänger: maximale Vereinfachung, eine Technik konsequent durchziehen
  Fortgeschrittene: Vertiefung, Feinheiten, Kadenz, Täuschung

Phase 3 – ANWENDUNG (ca. 20–25 % der Gesamtzeit)
  Ziel: Technik in realistischeren Zusammenhängen anwenden
  Inhalt: Pratzentraining, Sackarbeit, Partnerdrills mit konkreten Aufgaben
  Prinzip: Klare Aufgabenstellung für jeden Drill – kein freies Üben ohne Ziel
  Aufgaben nach dem Muster: „Auf Signal X führe Y aus", „Partner führt A, du reagierst mit B"
  Materiale im Wechsel wenn nötig (Rotationsmodell)

Phase 4 – BELASTUNG / KONDITION (ca. 15–20 % der Gesamtzeit, wenn passend)
  Ziel: Konditionelle Kapazität unter boxspezifischen Bedingungen aufbauen
  Inhalt: Intensive Runden an Sack oder Pratzen, Intervalle, Kombinationsserien
  Prinzip: Nur wenn methodisch sinnvoll – bei Regenerations-Modus geringer oder weglassen
  Kinder/Jugend: deutlich reduzierte Intensität, keine langen Maximalbelastungen

Phase 5 – KAMPFNAHE FORM / SITUATIVES TRAINING (optional, nur wenn Sparring erlaubt)
  Ziel: Erlerntes in kampfnahen Situationen anwenden
  Inhalt: Kontrolliertes Sparring, situative Aufgaben im Ring oder an Pratzen
  Prinzip: Immer mit klaren Regeln und Trainer-Begleitung
  Nur wenn: Ring verfügbar UND Sparring explizit erlaubt UND Niveau ausreichend

Phase 6 – ABSCHLUSS (ca. 10 % der Gesamtzeit)
  Ziel: Regeneration einleiten, Reflexion ermöglichen
  Inhalt: Cool-down, statisches Dehnen, kurze Feedback-Runde
  Prinzip: Ruhige Atmosphäre, Trainer fasst Schwerpunkt in 2–3 Sätzen zusammen

WICHTIG: Die Phasen 4 und 5 können wegfallen oder zusammengelegt werden je nach
Modus, Zielgruppe und verfügbarer Zeit.

═══════════════════════════════════════════════════
METHODISCHE GRUNDPRINZIPIEN (IMMER BEACHTEN)
═══════════════════════════════════════════════════

Roter Faden:
- Der technische Fokus der Einheit muss in Phase 2, 3 und wo sinnvoll in Phase 4 explizit sichtbar sein
- Kein Block darf thematisch beliebig sein
- Der Trainer soll nach dem Plan sofort erkennen: „Darum geht es heute"

Gruppenspezifik:
- Große Gruppen (> 12 Personen): Stationsbetrieb oder Rotationsmodell verwenden
  → Einfache Regie, klare Stationsschilder, Wechselsignal definieren
- Kinder (Boxzwerge, 6–9 Jahre): maximal 2–3 Inhalte, spielerisch, 5–8 Minuten je Block
- Jugend (10–14 J.): pädagogische Sprache, angemessene Intensität, klar strukturierte Aufgaben
- Jugend (15–18 J.): kann mehr Komplexität tragen, aber kein Leistungsdruck
- Anfänger (alle Gruppen): Technik hat absoluten Vorrang vor Tempo und Intensität
- Fortgeschrittene/Leistung: situative Aufgaben, mehr Druck, realistischere Szenarien

Wiederholung vor Variation:
- Eine Technik mehrfach in verschiedenen Kontexten zeigen (Schatten → Sack → Pratzen → Partnerform)
- Keine Übungssammlung ohne erkennbare Steigerungslogik

Coaching-Cues pro Block:
- 2–4 konkrete, sofort umsetzbare Trainerhinweise
- Keine theoretischen Absätze
- Praxissprache: „Knie weich!", „Deckung hoch nach dem Jab!", „Schritt VOR den Angriff!"

═══════════════════════════════════════════════════
TRAININGSMODUS (bestimmt Charakter und Intensität)
═══════════════════════════════════════════════════

GRUNDSCHULE:
  - Höchste Priorität: korrekte Technik in einfachsten Formen
  - Sehr einfache Aufgabenstellungen, maximale Wiederholungszahl
  - Keine Kombinationen über 2 Schläge zu Beginn, nur isolierte Techniken
  - Tempovorgabe: langsam und kontrolliert
  - Coaching: häufige Korrekturen, ruhige Sprache, viel Lob
  - Geeignet für: Ersteinsteiger, nach langer Pause, erste Einheiten einer neuen Gruppe

TECHNIKFOKUS:
  - Technik in mittlerem Tempo, sauber und präzise
  - Korrekturen aktiv einbauen (Trainer geht durch die Reihen)
  - Kombinationen bis 3–4 Schläge möglich, wenn bereits bekannt
  - Coaching-Cues zu Körperhaltung, Gewichtsverlagerung, Hüftrotation
  - Kein Sparring, keine maximale Belastung

ANWENDUNG:
  - Technik in realistischeren, partnerorientierten Szenarien
  - Klare Drill-Aufgaben: wer macht was wann
  - Pratzen-Szenarien mit konkretem Angriff-Verteidigung-Ablauf
  - Mittlere Intensität, Ergebnis wichtiger als Tempo
  - Coaching: Aufgabe klar kommunizieren, nach jedem Drill Feedback

WETTKAMPFNAH:
  - Höhere Intensität als Standard
  - Zeitdruck, reale Drucksituationen, Ermüdungstoleranz trainieren
  - Situative Aufgaben im Ring wenn verfügbar
  - Nur für Leistungs- oder Fortgeschrittenengruppen mit ausreichend Vorerfahrung
  - Sparring wenn erlaubt und Ring verfügbar

REGENERATION / LOCKER:
  - Bewusst reduzierte Belastung nach intensiver Phase oder Wettkampf
  - Koordinations- und Technikarbeit im niedrigen Tempo
  - Kein konditioneller Druck
  - Betonte Cool-down- und Mobilitätsphase am Ende

═══════════════════════════════════════════════════
SONDERPLANTYPEN
═══════════════════════════════════════════════════

KOMBIPLAN (Ferienbetrieb oder zusammengelegte Gruppen):
  - Es sind zwei Gruppen mit unterschiedlichem Alter und/oder Niveau zusammen
  - Oberstes Gebot: ALLE Sportler können ALLE Übungen ausführen (Basisvariante)
  - Jede Übung bekommt eine ERWEITERUNG für stärkere/ältere Sportler
  - Differenzierungsformel: "Basis: [einfache Form] – Erweiterung für Fortgeschrittene: [komplexere Form]"
  - Stationsorganisation bevorzugen: gibt Flexibilität für unterschiedliche Niveaus
  - coaching_points müssen BEIDE Niveaus ansprechen ("Anfänger achten auf X, Fortgeschrittene auf Y")
  - Keine maximale Intensität für die schwächere Gruppe
  - Im Ferienbetrieb gilt: Organisation besonders einfach und klar halten
  - target_group enthält beide Gruppen explizit
  - organization_notes muss die heterogene Gruppe explizit adressieren

FOLGEPLAN (aufbauend auf vorherigem Plan):
  - Das Hauptthema (technischer Fokus) des ersten Plans wird beibehalten
  - ABER: Anpassung an die neue Gruppe (anderes Alter, anderes Niveau)
  - Kein Plan darf eine 1:1-Kopie des Vorgängers sein
  - Steigerungslogik: mehr Komplexität, andere Kombinationen, neuer Anwendungskontext
  - Intensität anpassen: stärkere Gruppe → mehr Druck; schwächere Gruppe → vereinfachen
  - Coaching-Schwerpunkte verschieben: was war beim ersten Plan das Problem?
    → beim Folgeplan andere Cues und Schwerpunkte wählen
  - summary und title müssen den Aufbaucharakter erkennbar machen

VORLAGE ALS AUSGANGSPUNKT:
  - Wenn eine geprüfte Vereinsvorlage als Basis angegeben ist, nutze sie als strukturellen Rahmen
  - Übernimm: methodischen Aufbau, Phasengliederung, Drilltypen, Organisations form
  - Passe IMMER an: konkrete Übungen, Coaching-Cues, Zeitangaben, Teilnehmerzahl, Materialbedarf
  - Bei Kombi-Vorlage: behalte Differenzierungslogik (Basis + Erweiterung) zwingend bei
  - Bei Folge-Vorlage: behalte Progressionsstruktur bei, steigere Komplexität
  - Der neue Plan muss ein eigenständiger, vollständig ausgefüllter Plan sein – kein Skelett

═══════════════════════════════════════════════════
FELDPRIORITÄTEN
═══════════════════════════════════════════════════

1. Plantyp (Kombi/Folge) → bestimmt die Grundstruktur und Differenzierungsanforderung
2. Trainingsmodus → bestimmt Charakter, Tempo, Komplexität
3. Technischer Fokus → bestimmt den roten Faden durch alle Blöcke
4. Allgemeines Trainingsziel / Freitext → ergänzende Orientierung
5. Infos für die KI / Rahmenbedingungen → situative Überlagerung
6. BoxGym-Basisprofil → verbindlicher Hintergrundrahmen`

function buildGymContextSection(gym: GymContext): string {
  const lines: string[] = []

  lines.push("## BoxGym-Profil (verbindlicher Kontext)")
  lines.push("")
  lines.push("Ausstattung:")
  if (!gym.has_ring) {
    lines.push("- Kein Ring vorhanden")
  } else {
    lines.push(
      `- Ring: vorhanden${gym.ring_often_available ? ", in der Regel verfügbar" : ", nicht immer verfügbar"}`,
    )
  }
  lines.push(`- Sandsäcke: ${gym.heavy_bags_count}`)
  lines.push(`- Pratzen-Paare: ${gym.mitts_pairs_count}`)
  lines.push(`- Springseile: ${gym.jump_ropes_count}`)
  lines.push(`- Medizinbälle: ${gym.medicine_balls_count}`)
  lines.push("")
  lines.push(`Kapazität: max. ${gym.max_group_size} Personen`)

  if (gym.space_description.trim()) {
    lines.push("")
    lines.push("Raumcharakter:")
    lines.push(gym.space_description.trim())
  }

  if (gym.training_principles.trim()) {
    lines.push("")
    lines.push("Trainingsprinzipien (Vereinsphilosophie – haben Vorrang):")
    lines.push(gym.training_principles.trim())
  }

  if (gym.group_characteristics.trim()) {
    lines.push("")
    lines.push("Gruppenrealität:")
    lines.push(gym.group_characteristics.trim())
  }

  lines.push("")
  lines.push("Materialplanung-Regeln:")
  lines.push(
    `- Maximale Parallelpaare an Sandsäcken: ${gym.heavy_bags_count}`,
  )
  lines.push(
    `- Maximale Pratzen-Stationen parallel: ${gym.mitts_pairs_count}`,
  )
  if (gym.heavy_bags_count + gym.mitts_pairs_count < 8) {
    lines.push("- Materialknappheit: Rotationsstationen oder Partnerübungen ohne Gerät einplanen")
  }

  return lines.join("\n")
}

function buildSystemPrompt(gym: GymContext | null): string {
  const parts = [BASE_SYSTEM_PROMPT]

  if (gym) {
    parts.push("")
    parts.push(buildGymContextSection(gym))
  }

  parts.push("")
  parts.push("JSON-Format (strikt einhalten):")
  parts.push(`{
  "title": "Kurzer Plantitel",
  "summary": "2-3 Sätze Zusammenfassung",
  "target_group": "Zielgruppe in einem Satz",
  "training_goal": "Hauptziel der Einheit",
  "organization_notes": "Hinweise zur Organisation besonders bei großen Gruppen",
  "blocks": [
    {
      "name": "Blockname",
      "duration_minutes": 15,
      "objective": "Ziel dieses Blocks",
      "setup": "Aufstellung, Stationsaufbau, Material",
      "drills": [
        { "name": "Übungsname", "description": "kurze Beschreibung", "duration_hint": "3 min" }
      ],
      "coaching_points": ["Cue 1", "Cue 2"],
      "scaling": "Wie einfacher/schwerer machen"
    }
  ],
  "safety_notes": "Sicherheitshinweise",
  "equipment_needed": ["Item 1", "Item 2"]
}`)

  return parts.join("\n")
}

// ─── Prompt-Aufbau ────────────────────────────────────────────────────────────

/**
 * Baut den User-Prompt aus den konkreten Eingabedaten.
 * Der System-Prompt enthält die Methodik – dieser Prompt liefert die Fakten der Einheit.
 * Strukturiert in drei Blöcke: Rahmendaten → Fachliche Steuerung → Zusatzinfos
 */
function buildUserPrompt(input: TrainingPlanInput): string {
  const timeInfo = input.training_time ? ` um ${input.training_time} Uhr` : ""
  const n = input.participant_count
  const isLargeGroup = n != null && n > 12
  const isKids = input.age_group?.includes("6") || input.age_group?.includes("9") || input.group_key?.toLowerCase().includes("boxzwerge")
  const isYouth = input.age_group?.toLowerCase().includes("jugend") || input.age_group?.includes("10") || input.age_group?.includes("14") || input.age_group?.includes("15") || input.age_group?.includes("18")
  const isPerformance = input.performance_level === "Leistung"
  const isBeginners = input.performance_level === "Anfänger"

  // Methodischer Ableitungshinweis aus Gruppenprofil – erleichtert der KI die Entscheidung
  const groupHints: string[] = []
  if (isLargeGroup) groupHints.push(`Große Gruppe (${n} Personen) → Rotations- oder Stationsmodell verwenden, einfache Regie`)
  if (isKids) groupHints.push("Kindergruppe → sehr kurze Blöcke (5–8 min), spielerisch, max. 2–3 Inhalte, keine Maximallast")
  if (isYouth && !isKids) groupHints.push("Jugendgruppe → pädagogisch, kontrollierte Intensität, keine Vollkontaktformen")
  if (isBeginners) groupHints.push("Anfänger → Technik absolut vor Intensität, einfachste Formen, maximale Wiederholung")
  if (isPerformance) groupHints.push("Leistungsgruppe → situative Aufgaben erlaubt, höherer Anspruch, Druck umsetzbar")

  const lines: string[] = [
    `═══════════════════════════════════════`,
    `EINHEIT: ${input.group_key}${timeInfo} · ${input.date}`,
    ...(input.plan_type === "combo"
      ? [`PLANTYP: KOMBIPLAN${input.is_holiday_combined ? " (Ferienbetrieb)" : " (zusammengelegte Gruppe)"}`]
      : input.plan_type === "followup"
        ? [`PLANTYP: FOLGEPLAN (aufbauend auf vorherigem Plan)`]
        : []),
    `═══════════════════════════════════════`,
    ``,
    `## Rahmendaten`,
    `Gruppe:          ${input.group_key}`,
    ...(input.training_time ? [`Uhrzeit:         ${input.training_time} Uhr`] : []),
    `Datum:           ${input.date}`,
    `Altersgruppe:    ${input.age_group ?? "nicht angegeben"}`,
    `Niveau:          ${input.performance_level ?? "nicht angegeben"}`,
    `Teilnehmerzahl:  ${n != null ? n : "unbekannt"}`,
    `Trainer:         ${input.trainer_count ?? 1}`,
    `Dauer:           ${input.duration_minutes ?? 90} Minuten`,
    `Sparring:        ${input.sparring_allowed ? "Erlaubt" : "Nicht geplant"}`,
    `Ring:            ${input.ring_available ? "Verfügbar" : "Nicht verfügbar"}`,
    ``,
  ]

  // ── VORLAGE als strukturierender Ausgangspunkt ───────────────────────────
  if (input.template_title || input.template_summary || input.template_training_goal) {
    const planTypeLabel =
      input.template_plan_type === "combo"
        ? "Kombiplan"
        : input.template_plan_type === "followup"
          ? "Folgeplan"
          : "Einzelplan"
    lines.push(`## Vereinsvorlage als Ausgangspunkt (PFLICHTBEACHTUNG)`)
    lines.push(`Vorlage:        "${input.template_name ?? input.template_title ?? "unbekannt"}" (${planTypeLabel})`)
    if (input.template_title) lines.push(`Titel:          ${input.template_title}`)
    if (input.template_summary) lines.push(`Zusammenfassung: ${input.template_summary}`)
    if (input.template_training_goal) lines.push(`Ziel der Vorlage: ${input.template_training_goal}`)
    lines.push(`→ Übernimm den methodischen Aufbau, die Phasengliederung und Drilltypen dieser Vorlage`)
    lines.push(`→ Passe konkrete Übungen, Coaching-Cues, Zeiten und Teilnehmerzahl an die heutigen Rahmendbedingungen an`)
    if (input.template_plan_type === "combo") {
      lines.push(`→ Kombi-Vorlage: Differenzierungslogik (Basis + Erweiterung) zwingend beibehalten`)
    }
    if (input.template_plan_type === "followup") {
      lines.push(`→ Folge-Vorlage: Progressionsstruktur beibehalten, Komplexität dem aktuellen Niveau anpassen`)
    }
    lines.push(`→ Der neue Plan muss ein vollständig ausgefüllter, eigenständiger Plan sein`)
    lines.push(``)
  }

  // ── KOMBIPLAN: Zusatzgruppe und Differenzierung ──────────────────────────
  if (input.plan_type === "combo") {
    lines.push(`## Kombiplan-Details (PFLICHTBEACHTUNG)`)
    lines.push(`Hauptgruppe:     ${input.group_key} (${input.age_group ?? "?"}, ${input.performance_level ?? "?"})`)
    if (input.secondary_group_key) {
      lines.push(`Zusatzgruppe:    ${input.secondary_group_key}`)
    }
    if (input.is_holiday_combined) {
      lines.push(`Ferienbetrieb:   Ja – beide Gruppen sind für diese Einheit zusammengelegt`)
      lines.push(`Organisation:    Einfache, stabile Struktur wählen; keine komplexen Rotationsmodelle`)
    }
    lines.push(`Differenzierung: Jede Übung enthält Basisvariante (für schwächere Gruppe) + Erweiterung (für stärkere Gruppe)`)
    lines.push(`Coaching-Cues:   Explizit beide Niveaus ansprechen (z. B. "Anfänger auf X achten, Fortgeschrittene auf Y")`)
    lines.push(``)
  }

  // ── FOLGEPLAN: Vorgänger-Kontext ──────────────────────────────────────────
  if (input.plan_type === "followup" && (input.based_on_plan_title || input.based_on_plan_summary)) {
    lines.push(`## Folgeplan-Kontext (PFLICHTBEACHTUNG)`)
    lines.push(`Vorheriger Plan: "${input.based_on_plan_title ?? "nicht bekannt"}"`)
    if (input.based_on_plan_summary) {
      lines.push(`Zusammenfassung: ${input.based_on_plan_summary}`)
    }
    lines.push(`→ Behalte den technischen Schwerpunkt des Vorgängerplans bei`)
    lines.push(`→ Passe Komplexität und Intensität an diese Gruppe an (Alter: ${input.age_group ?? "?"}, Niveau: ${input.performance_level ?? "?"})`)
    lines.push(`→ Wähle ANDERE Drills und Coaching-Schwerpunkte – kein Copy-Paste`)
    lines.push(`→ Steigere dort wo es passt: mehr Kombinationstiefe, neuer Anwendungskontext, höherer Druck`)
    lines.push(``)
  }

  lines.push(`## Fachliche Steuerung (höchste Priorität – bitte strikt umsetzen)`)
  lines.push(`Trainingsmodus:  ${input.training_mode ?? "nicht angegeben → Standard-Aufbau verwenden"}`)
  lines.push(`Technischer Fokus: ${input.training_focus ?? "nicht angegeben → allgemeines Boxtraining"}`)
  lines.push(``)
  lines.push(`Wichtig zum Fokus: Der technische Fokus "${input.training_focus ?? "Allgemein"}" soll in Phase 2 (Technik),`)
  lines.push(`Phase 3 (Anwendung) und wo sinnvoll auch in Phase 4 (Belastung) explizit erkennbar sein.`)
  lines.push(`Kein Block soll thematisch neutral oder beliebig sein.`)
  lines.push(``)
  lines.push(`## Allgemeines Trainingsziel / Freitext`)
  lines.push(input.training_goal?.trim() || "Keine Angabe.")
  lines.push(``)

  if (groupHints.length > 0) {
    lines.push(`## Methodische Hinweise zur Gruppe (bitte beachten)`)
    groupHints.forEach((h) => lines.push(`→ ${h}`))
    lines.push(``)
  }

  lines.push(`## Zusatzinfos / Rahmenbedingungen (situative Überlagerung)`)
  lines.push(input.ai_context?.trim() || "Keine weiteren Angaben.")

  return lines.join("\n")
}

// ─── Fallback-Plan ────────────────────────────────────────────────────────────

function buildFallbackPlan(input: TrainingPlanInput): GeneratedTrainingPlan {
  const duration = input.duration_minutes ?? 90
  const warmup = Math.round(duration * 0.2)
  const main = Math.round(duration * 0.55)
  const cooldown = duration - warmup - main

  return {
    title: `Trainingsplan ${input.group_key}${input.training_time ? ` ${input.training_time}` : ""} – ${input.date}`,
    summary: `Standardplan für ${input.group_key}. KI-Generierung war nicht verfügbar.`,
    target_group: `${input.group_key}${input.age_group ? `, ${input.age_group}` : ""}`,
    training_goal: input.training_goal ?? "Allgemeines Boxtraining",
    organization_notes:
      input.participant_count && input.participant_count > 10
        ? "Große Gruppe: Stationsbetrieb empfohlen."
        : "Gruppentraining im Plenum.",
    blocks: [
      {
        name: "Aufwärmen",
        duration_minutes: warmup,
        objective: "Körper aktivieren, Konzentration aufbauen",
        setup: "Alle Sportler in einer Reihe oder im Kreis",
        drills: [
          { name: "Seilspringen", description: "Lockeres Aufwärmen an der Longe oder frei", duration_hint: `${Math.round(warmup / 2)} min` },
          { name: "Schattboxen", description: "Locker durch den Raum, eigene Bewegung", duration_hint: `${Math.round(warmup / 2)} min` },
        ],
        coaching_points: ["Locker bleiben", "Atmung kontrollieren"],
        scaling: "Intensität nach eigenem Ermessen",
      },
      {
        name: "Hauptteil",
        duration_minutes: main,
        objective: input.training_goal ?? "Technik und Kondition",
        setup: "Paare oder Stationen je nach Gruppengröße",
        drills: [
          { name: "Pratzentraining", description: "Grundkombinationen an Pratzen", duration_hint: `${Math.round(main / 2)} min` },
          { name: "Sackarbeit", description: "Konditionelle Arbeit am Sandsack", duration_hint: `${Math.round(main / 2)} min` },
        ],
        coaching_points: ["Technik vor Kraft", "Deckung halten"],
        scaling: "Anfänger: langsamer, Fortgeschrittene: mehr Tempo",
      },
      {
        name: "Cool-down",
        duration_minutes: cooldown,
        objective: "Regeneration einleiten",
        setup: "Alle gemeinsam",
        drills: [
          { name: "Dehnen", description: "Statisches Dehnen der Hauptmuskelgruppen", duration_hint: `${cooldown} min` },
        ],
        coaching_points: ["Tief atmen", "Spannung lösen"],
        scaling: "Jeder in eigenem Tempo",
      },
    ],
    safety_notes: "Handschuhe und Bandagen vorher kontrollieren. Bei Erschöpfungszeichen Pause einlegen.",
    equipment_needed: ["Handschuhe", "Bandagen", "Pratzen", "Sandsäcke", "Springseile"],
  }
}

// ─── JSON-Parsing ─────────────────────────────────────────────────────────────

function parseGeneratedPlan(raw: string): GeneratedTrainingPlan | null {
  try {
    // Markdown-Codeblöcke entfernen falls KI sie doch einfügt
    const cleaned = raw
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/, "")
      .trim()

    const parsed: unknown = JSON.parse(cleaned)
    if (!parsed || typeof parsed !== "object") return null

    const obj = parsed as Record<string, unknown>
    if (typeof obj.title !== "string") return null
    if (!Array.isArray(obj.blocks)) return null

    return obj as unknown as GeneratedTrainingPlan
  } catch {
    return null
  }
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────────

export async function generateTrainingPlan(
  input: TrainingPlanInput,
  gymContext?: GymContext | null,
): Promise<{
  plan: GeneratedTrainingPlan
  usedFallback: boolean
  error?: string
}> {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) {
    return {
      plan: buildFallbackPlan(input),
      usedFallback: true,
      error: "Kein OpenAI API-Key konfiguriert (OPENAI_API_KEY fehlt).",
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: buildSystemPrompt(gymContext ?? null) }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: buildUserPrompt(input) }],
          },
        ],
        max_output_tokens: 2000,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeoutId)
    const msg = isAbortError(error) ? "OpenAI-Anfrage hat das Zeitlimit überschritten." : "OpenAI-Verbindungsfehler."
    return { plan: buildFallbackPlan(input), usedFallback: true, error: msg }
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "")
    return {
      plan: buildFallbackPlan(input),
      usedFallback: true,
      error: `OpenAI-Fehler ${response.status}: ${errText || "Unbekannter Fehler"}`,
    }
  }

  const payload = (await response.json()) as OpenAiResponsePayload
  const raw = extractOpenAiText(payload)

  if (!raw) {
    return { plan: buildFallbackPlan(input), usedFallback: true, error: "KI hat leere Antwort geliefert." }
  }

  const parsed = parseGeneratedPlan(raw)
  if (!parsed) {
    return {
      plan: buildFallbackPlan(input),
      usedFallback: true,
      error: "KI-Antwort konnte nicht als Trainingsplan gelesen werden (kein valides JSON).",
    }
  }

  return { plan: parsed, usedFallback: false }
}
