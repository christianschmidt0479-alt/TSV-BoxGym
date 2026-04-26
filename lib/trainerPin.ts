import { hashAuthSecret, verifyAuthSecret } from "@/lib/authSecret"
import { PIN_HINT, PIN_REGEX, PIN_REQUIREMENTS_MESSAGE, isValidPin, normalizePin } from "@/lib/pin"

export const TRAINER_PIN_REGEX = PIN_REGEX
export const TRAINER_PIN_HINT = PIN_HINT
export const TRAINER_PIN_REQUIREMENTS_MESSAGE = PIN_REQUIREMENTS_MESSAGE
export const ADMIN_PASSWORD_REQUIREMENTS_MESSAGE = PIN_REQUIREMENTS_MESSAGE

export function isTrainerPinCompliant(value: string) {
  return isValidPin(value)
}

export async function hashTrainerPin(value: string) {
  return hashAuthSecret(normalizePin(value))
}

export async function verifyTrainerPinHash(candidate: string, storedHash: string | null | undefined) {
  if (!storedHash) return false
  return verifyAuthSecret(normalizePin(candidate), storedHash)
}
