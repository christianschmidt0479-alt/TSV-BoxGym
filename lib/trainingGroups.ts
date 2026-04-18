export const TRAINING_GROUPS = [
  "Basic 10 - 14 Jahre",
  "Basic 15 - 18 Jahre",
  "Basic Ü18",
  "L-Gruppe",
] as const

export type TrainingGroup = (typeof TRAINING_GROUPS)[number]

function sanitizeTrainingGroup(value?: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ")
}

function hasAnyGroupKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword))
}

function toCompactTrainingGroup(value?: string | null) {
  return sanitizeTrainingGroup(value)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function getTrainingGroupSignature(value?: string | null) {
  // Boxzwerge-Logik stillgelegt
  return ""
}

export function parseTrainingGroup(value?: string | null): TrainingGroup | null {
  const sanitized = sanitizeTrainingGroup(value)
  return (TRAINING_GROUPS.find((group) => group === sanitized) ?? null) as TrainingGroup | null
}

export function normalizeTrainingGroup(value?: string | null): TrainingGroup | "" {
  const sanitized = sanitizeTrainingGroup(value)
  if (sanitized === "Boxzwerge") return ""
  return (TRAINING_GROUPS.find((group) => group === sanitized) ?? "") as TrainingGroup | ""
}



export function areEquivalentTrainingGroups(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeTrainingGroup(left)
  const normalizedRight = normalizeTrainingGroup(right)

  if (normalizedLeft && normalizedRight) {
    return normalizedLeft === normalizedRight
  }

  const signatureLeft = getTrainingGroupSignature(left)
  const signatureRight = getTrainingGroupSignature(right)
  if (signatureLeft && signatureRight) {
    return signatureLeft === signatureRight
  }

  return sanitizeTrainingGroup(left).toLowerCase() === sanitizeTrainingGroup(right).toLowerCase()
}

export function isCompatibleOfficeListGroup(baseGroup?: string | null, officeGroup?: string | null, options?: { isTrainer?: boolean }) {
  // Boxzwerge-Logik stillgelegt
  return false
}

export function normalizeTrainingGroupOrFallback(value?: string | null, fallback: TrainingGroup = TRAINING_GROUPS[0]) {
  // Boxzwerge-Logik stillgelegt
  return fallback
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
