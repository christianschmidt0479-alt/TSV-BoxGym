import { createHmac, timingSafeEqual } from "node:crypto"

const DEVICE_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

type DeviceTokenPayload = {
  memberId: string
  issuedAt: number
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8")
}

function signValue(value: string) {
  const secret =
    process.env.DEVICE_TOKEN_SECRET ||
    process.env.QR_ACCESS_SESSION_SECRET ||
    process.env.MEMBER_DEVICE_SESSION_SECRET ||
    process.env.TRAINER_SESSION_SECRET ||
    "development-device-token-secret"

  return createHmac("sha256", secret)
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function signDeviceToken(memberId: string): string {
  const payload: DeviceTokenPayload = {
    memberId,
    issuedAt: Date.now(),
  }

  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = signValue(encodedPayload)

  return `${encodedPayload}.${signature}`
}

export function verifyDeviceToken(token: string): { valid: boolean; memberId?: string } {
  if (!token) {
    return { valid: false }
  }

  const parts = token.split(".")
  if (parts.length !== 2) {
    return { valid: false }
  }

  const [encodedPayload, providedSignature] = parts
  const expectedSignature = signValue(encodedPayload)
  const providedBuffer = Buffer.from(providedSignature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (providedBuffer.length !== expectedBuffer.length) {
    return { valid: false }
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return { valid: false }
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as Partial<DeviceTokenPayload>

    if (!parsed.memberId || typeof parsed.memberId !== "string") {
      return { valid: false }
    }

    if (!parsed.issuedAt || typeof parsed.issuedAt !== "number") {
      return { valid: false }
    }

    const now = Date.now()
    if (parsed.issuedAt > now + 5 * 60 * 1000) {
      return { valid: false }
    }

    if (now - parsed.issuedAt > DEVICE_TOKEN_MAX_AGE_MS) {
      return { valid: false }
    }

    return {
      valid: true,
      memberId: parsed.memberId,
    }
  } catch {
    return { valid: false }
  }
}
