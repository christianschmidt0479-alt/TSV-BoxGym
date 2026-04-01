import { hashAuthSecret, verifyAuthSecret } from "./authSecret"
import { isValidPin, normalizePin, PIN_HINT, PIN_REQUIREMENTS_MESSAGE } from "./pin"

export const TRAINER_PIN_HINT = PIN_HINT
export const TRAINER_PIN_REQUIREMENTS_MESSAGE = PIN_REQUIREMENTS_MESSAGE

export function isTrainerPinCompliant(value: string) {
  return isValidPin(value)
}

export async function hashTrainerPin(value: string) {
  return hashAuthSecret(normalizePin(value))
}

export async function verifyTrainerPinHash(pin: string, passwordHash: string) {
  return verifyAuthSecret(normalizePin(pin), passwordHash)
}
