import { hashAuthSecret, verifyAuthSecret } from "./authSecret"
import { normalizePin } from "./pin"

export const TRAINER_PIN_REGEX = /^[^\s]{8,64}$/
export const TRAINER_PIN_HINT = "Passwort: 8-64 Zeichen, ohne Leerzeichen. Buchstaben, Zahlen und Sonderzeichen sind erlaubt."
export const TRAINER_PIN_REQUIREMENTS_MESSAGE =
  "Das Passwort muss 8 bis 64 Zeichen lang sein und darf keine Leerzeichen enthalten."
export const ADMIN_PASSWORD_HINT = "Passwort: 8-64 Zeichen, ohne Leerzeichen. Buchstaben, Zahlen und Sonderzeichen sind erlaubt."
export const ADMIN_PASSWORD_REQUIREMENTS_MESSAGE =
  "Das Passwort muss 8 bis 64 Zeichen lang sein und darf keine Leerzeichen enthalten."

export function isTrainerPinCompliant(value: string) {
  return TRAINER_PIN_REGEX.test(normalizePin(value))
}

export async function hashTrainerPin(value: string) {
  return hashAuthSecret(normalizePin(value))
}

export async function verifyTrainerPinHash(pin: string, passwordHash: string) {
  return verifyAuthSecret(normalizePin(pin), passwordHash)
}
