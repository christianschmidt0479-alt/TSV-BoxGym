export const TRAINER_PIN_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,16}$/
export const TRAINER_PIN_REQUIREMENTS_MESSAGE =
  "Der PIN muss 8-16 Zeichen lang sein und Buchstaben, Zahlen sowie mindestens ein Sonderzeichen enthalten."
export const TRAINER_PIN_UPDATE_REQUIRED_MESSAGE =
  "PIN entspricht nicht den aktuellen Anforderungen. Bitte neuen PIN vergeben."

const textEncoder = new TextEncoder()

export function normalizeTrainerPin(value: string) {
  return value.trim()
}

export function isTrainerPinCompliant(value: string) {
  return TRAINER_PIN_REGEX.test(normalizeTrainerPin(value))
}

export async function hashTrainerPin(value: string) {
  const bytes = textEncoder.encode(normalizeTrainerPin(value))
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
