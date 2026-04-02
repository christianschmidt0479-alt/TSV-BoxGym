export const TRAINING_GROUPS = [
  "Basic 10 - 14 Jahre",
  "Basic 15 - 18 Jahre",
  "Basic Ü18",
  "L-Gruppe",
  "Boxzwerge",
] as const

export type TrainingGroup = (typeof TRAINING_GROUPS)[number]

function sanitizeTrainingGroup(value?: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ")
}

export function parseTrainingGroup(value?: string | null): TrainingGroup | null {
  const sanitized = sanitizeTrainingGroup(value)
  return (TRAINING_GROUPS.find((group) => group === sanitized) ?? null) as TrainingGroup | null
}

export function normalizeTrainingGroup(value?: string | null): TrainingGroup | "" {
  const exact = parseTrainingGroup(value)
  if (exact) return exact

  const normalized = sanitizeTrainingGroup(value).toLowerCase()
  if (!normalized) return ""

  if (normalized === "boxzwerge") return "Boxzwerge"
  if (/^l[\s-]*gruppe$/i.test(normalized)) return "L-Gruppe"
  if (/(basic|grundgruppe)/i.test(normalized) && /\b10\b/.test(normalized) && /\b14\b/.test(normalized)) {
    return "Basic 10 - 14 Jahre"
  }
  if (/(basic|grundgruppe)/i.test(normalized) && /\b15\b/.test(normalized) && /\b18\b/.test(normalized)) {
    return "Basic 15 - 18 Jahre"
  }
  if (/(basic|grundgruppe)/i.test(normalized) && /\b18\b/.test(normalized) && !/\b10\b|\b14\b|\b15\b/.test(normalized)) {
    return "Basic Ü18"
  }

  return ""
}

export function normalizeTrainingGroupOrFallback(value?: string | null, fallback: TrainingGroup = TRAINING_GROUPS[0]) {
  return normalizeTrainingGroup(value) || fallback
}

export function isTrainingGroup(value?: string | null): value is TrainingGroup {
  return parseTrainingGroup(value) !== null
}

export function compareTrainingGroupOrder(left?: string | null, right?: string | null) {
  const leftIndex = TRAINING_GROUPS.indexOf(normalizeTrainingGroup(left) || TRAINING_GROUPS[0])
  const rightIndex = TRAINING_GROUPS.indexOf(normalizeTrainingGroup(right) || TRAINING_GROUPS[0])
  return leftIndex - rightIndex
}

export function buildTrainingGroupOptions(values: Array<string | null | undefined> = []) {
  const extraGroups = Array.from(
    new Set(
      values
        .map((value) => {
          const sanitized = sanitizeTrainingGroup(value)
          if (!sanitized) return ""
          return normalizeTrainingGroup(sanitized) || sanitized
        })
        .filter((value): value is string => !!value)
    )
  )
    .filter((group) => !TRAINING_GROUPS.includes(group as TrainingGroup))
    .sort((left, right) => left.localeCompare(right, "de"))

  return [...TRAINING_GROUPS, ...extraGroups]
}

export function getRecommendedTrainingGroup(birthdate?: string | null): TrainingGroup {
  if (!birthdate) return "Basic 15 - 18 Jahre"

  const today = new Date()
  const birth = new Date(`${birthdate}T12:00:00`)
  if (Number.isNaN(birth.getTime())) return "Basic 15 - 18 Jahre"

  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }

  if (age <= 14) return "Basic 10 - 14 Jahre"
  if (age <= 18) return "Basic 15 - 18 Jahre"
  return "Basic Ü18"
}
