import { createHmac, timingSafeEqual } from "node:crypto"

type GsMembershipConfirmationPayload = {
  memberId: string
  exp: number
}

function getGsMembershipConfirmationSecret() {
  const secret =
    process.env.GS_MEMBERSHIP_CONFIRMATION_SECRET ||
    process.env.PUBLIC_AREA_SESSION_SECRET ||
    process.env.TRAINER_SESSION_SECRET ||
    ""

  if (!secret) {
    throw new Error("Missing GS membership confirmation secret")
  }

  return secret
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url")
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8")
}

function sign(value: string) {
  return createHmac("sha256", getGsMembershipConfirmationSecret()).update(value).digest("base64url")
}

export function createGsMembershipConfirmationToken(memberId: string, maxAgeSeconds = 7 * 24 * 60 * 60) {
  const payload: GsMembershipConfirmationPayload = {
    memberId,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  }

  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function verifyGsMembershipConfirmationToken(token: string | null | undefined) {
  if (!token) return null

  const [encodedPayload, providedSignature] = token.split(".")
  if (!encodedPayload || !providedSignature) {
    return null
  }

  const expectedSignature = sign(encodedPayload)
  const provided = Buffer.from(providedSignature)
  const expected = Buffer.from(expectedSignature)

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as GsMembershipConfirmationPayload
    if (!payload.memberId || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload
  } catch {
    return null
  }
}