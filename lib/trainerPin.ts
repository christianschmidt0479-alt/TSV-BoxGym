import { isValidPin, normalizePin, PIN_HINT, PIN_REQUIREMENTS_MESSAGE } from "./pin"

export const TRAINER_PIN_HINT = PIN_HINT
export const TRAINER_PIN_REQUIREMENTS_MESSAGE = PIN_REQUIREMENTS_MESSAGE

const textEncoder = new TextEncoder()

export function isTrainerPinCompliant(value: string) {
  return isValidPin(value)
}

export async function hashTrainerPin(value: string) {
  const bytes = textEncoder.encode(normalizePin(value))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export function safeCompareSecret(left: string, right: string) {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return result === 0
}

export async function verifyTrainerPinHash(pin: string, passwordHash: string) {
  const pinHash = await hashTrainerPin(pin)
  return safeCompareSecret(pinHash, passwordHash)
}
