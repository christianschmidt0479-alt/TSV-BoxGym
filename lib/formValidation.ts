import { isValidPin, PIN_REQUIREMENTS_MESSAGE } from "@/lib/pin"

/**
 * Zentrale Validierungs-Utilities für Formulare
 * Rückgabe: { valid: boolean; error?: string }
 */

export type ValidationResult = {
  valid: boolean
  error?: string
}

/**
 * Validiert Vor- und Nachname
 * - Mindestens 2 Zeichen
 * - Nur Buchstaben, Leerzeichen, Bindestriche, Apostrophe
 */
export function validateName(value: string, fieldName: string = "Name"): ValidationResult {
  const trimmed = value.trim()

  if (!trimmed) {
    return { valid: false, error: `${fieldName} ist erforderlich.` }
  }

  if (trimmed.length < 2) {
    return { valid: false, error: `${fieldName} muss mindestens 2 Zeichen lang sein.` }
  }

  if (trimmed.length > 50) {
    return { valid: false, error: `${fieldName} darf maximal 50 Zeichen lang sein.` }
  }

  // Nur Buchstaben, Leerzeichen, Bindestriche, Apostrophe
  if (!/^[a-zA-ZäöüßÄÖÜ\s'-]+$/.test(trimmed)) {
    return { valid: false, error: `${fieldName} darf nur Buchstaben, Leerzeichen, Bindestriche und Apostrophe enthalten.` }
  }

  return { valid: true }
}

/**
 * Validiert PIN (6 bis 16 Zeichen, ohne Leerzeichen)
 */
export function validatePin(value: string): ValidationResult {
  const trimmed = value.trim()

  if (!trimmed) {
    return { valid: false, error: "PIN ist erforderlich." }
  }

  if (!isValidPin(trimmed)) {
    return {
      valid: false,
      error: PIN_REQUIREMENTS_MESSAGE,
    }
  }

  return { valid: true }
}

/**
 * Validiert E-Mail-Adresse
 */
export function validateEmail(value: string): ValidationResult {
  const trimmed = value.trim()

  if (!trimmed) {
    return { valid: false, error: "E-Mail ist erforderlich." }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: "Bitte gib eine gültige E-Mail-Adresse ein." }
  }

  if (trimmed.length > 100) {
    return { valid: false, error: "E-Mail-Adresse ist zu lang." }
  }

  return { valid: true }
}

/**
 * Validiert Telefonnummer (optional)
 * Falls vorhanden: Mindestens 9 Ziffern
 */
export function validatePhone(value: string, required: boolean = false): ValidationResult {
  const trimmed = value.trim()

  if (!trimmed) {
    return { valid: !required, error: required ? "Telefonnummer ist erforderlich." : undefined }
  }

  // Nur Ziffern, +, -, Klammern, Leerzeichen erlaubt
  if (!/^[+\-() 0-9]+$/.test(trimmed)) {
    return {
      valid: false,
      error: "Telefonnummer darf nur Ziffern, +, -, Klammern und Leerzeichen enthalten.",
    }
  }

  // Mindestens 9 Ziffern
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length < 9) {
    return { valid: false, error: "Telefonnummer muss mindestens 9 Ziffern enthalten." }
  }

  if (trimmed.length > 30) {
    return { valid: false, error: "Telefonnummer ist zu lang." }
  }

  return { valid: true }
}

/**
 * Validiert Geburtsdatum
 * - Mindestens 1950
 * - Nicht in der Zukunft
 */
export function validateBirthdate(value: string): ValidationResult {
  if (!value) {
    return { valid: false, error: "Geburtsdatum ist erforderlich." }
  }

  const date = new Date(`${value}T00:00:00`)
  const now = new Date()

  if (isNaN(date.getTime())) {
    return { valid: false, error: "Ungültiges Datumsformat." }
  }

  if (date > now) {
    return { valid: false, error: "Geburtsdatum kann nicht in der Zukunft liegen." }
  }

  const year = date.getFullYear()
  if (year < 1900) {
    return { valid: false, error: "Bitte gib ein gültiges Geburtsdatum ein." }
  }

  // Alter prüfen (muss Mitglied sein können – ca. 4 Jahre alt aufwärts)
  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const monthDiff = today.getMonth() - date.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age--
  }

  if (age < 4) {
    return { valid: false, error: `Du musst mindestens 4 Jahre alt sein (aktuell ${age} Jahre).` }
  }

  return { valid: true }
}

/**
 * Batch-Validierung (mehrere Felder auf einmal)
 * Nützlich für Form-Submission
 */
export function validateForm(
  values: Record<string, string>,
  rules: Record<string, (val: string) => ValidationResult>
): Record<string, string | undefined> {
  const errors: Record<string, string | undefined> = {}

  for (const [field, validator] of Object.entries(rules)) {
    const value = values[field] || ""
    const result = validator(value)
    if (!result.valid) {
      errors[field] = result.error
    }
  }

  return errors
}
