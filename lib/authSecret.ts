import { compare, hash } from "bcryptjs"

const BCRYPT_PREFIX = /^\$2[aby]\$\d{2}\$/
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i
const BCRYPT_ROUNDS = 10

export function isBcryptHash(value: string) {
  return BCRYPT_PREFIX.test(value.trim())
}

export function isSha256Hex(value: string) {
  return SHA256_HEX_PATTERN.test(value.trim())
}

export async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value.trim())
  const digest = await crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function hashAuthSecret(value: string) {
  return hash(value.trim(), BCRYPT_ROUNDS)
}

export async function verifyAuthSecret(candidate: string, storedSecret: string) {
  const normalizedCandidate = candidate.trim()
  const normalizedStored = storedSecret.trim()

  if (!normalizedCandidate || !normalizedStored) return false

  if (isBcryptHash(normalizedStored)) {
    return compare(normalizedCandidate, normalizedStored)
  }

  if (normalizedCandidate === normalizedStored) return true

  if (isSha256Hex(normalizedStored)) {
    return (await sha256Hex(normalizedCandidate)) === normalizedStored
  }

  return normalizedCandidate === normalizedStored
}
