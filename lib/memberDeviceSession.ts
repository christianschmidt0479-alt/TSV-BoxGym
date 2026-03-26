const MEMBER_DEVICE_MAX_AGE_DAYS = 90
const MEMBER_DEVICE_MAX_AGE_SECONDS = MEMBER_DEVICE_MAX_AGE_DAYS * 24 * 60 * 60
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type MemberDeviceSessionPayload = {
  memberId: string
  firstName: string
  lastName: string
  isCompetitionMember: boolean
  exp: number
}

function getSessionSecret() {
  const secret =
    process.env.MEMBER_DEVICE_SESSION_SECRET ||
    process.env.TRAINER_SESSION_SECRET ||
    (process.env.NODE_ENV !== "production" ? process.env.ADMIN_LOGIN_PASSWORD || "" : "")

  if (!secret) {
    throw new Error("Missing MEMBER_DEVICE_SESSION_SECRET")
  }

  return secret
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

function toBase64Url(value: string) {
  return bytesToBase64Url(encoder.encode(value))
}

function fromBase64Url(value: string) {
  return decoder.decode(base64UrlToBytes(value))
}

async function importHmacKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
}

async function sign(value: string) {
  const key = await importHmacKey()
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value))
  return bytesToBase64Url(new Uint8Array(signature))
}

function timingSafeEqualString(left: string, right: string) {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i]
  }

  return result === 0
}

export async function createMemberDeviceToken(input: Omit<MemberDeviceSessionPayload, "exp">) {
  const payload: MemberDeviceSessionPayload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + MEMBER_DEVICE_MAX_AGE_SECONDS,
  }

  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = await sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export async function verifyMemberDeviceToken(token: string | undefined | null) {
  if (!token) return null
  const [encodedPayload, providedSignature] = token.split(".")
  if (!encodedPayload || !providedSignature) return null

  const expectedSignature = await sign(encodedPayload)
  if (!timingSafeEqualString(providedSignature, expectedSignature)) {
    return null
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as MemberDeviceSessionPayload
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    if (!payload.memberId || !payload.firstName || !payload.lastName) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function getMemberDeviceSessionMaxAgeMs() {
  return MEMBER_DEVICE_MAX_AGE_SECONDS * 1000
}
