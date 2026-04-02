import { createHmac, timingSafeEqual } from "node:crypto"

export type GsMembershipDecision = "ja" | "nein"

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

function encodeCompactPayload(payload: GsMembershipConfirmationPayload) {
  return `${toBase64Url(payload.memberId)}.${payload.exp.toString(36)}`
}

function sign(value: string) {
  return createHmac("sha256", getGsMembershipConfirmationSecret()).update(value).digest("base64url")
}

export function createGsMembershipConfirmationToken(memberId: string, maxAgeSeconds = 7 * 24 * 60 * 60) {
  const payload: GsMembershipConfirmationPayload = {
    memberId,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  }

  const encodedPayload = encodeCompactPayload(payload)
  const signature = sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function normalizeGsMembershipDecision(value: string | null | undefined): GsMembershipDecision | null {
  const normalizedValue = value?.trim().toLowerCase()

  if (normalizedValue === "ja" || normalizedValue === "yes") {
    return "ja"
  }

  if (normalizedValue === "nein" || normalizedValue === "no") {
    return "nein"
  }

  return null
}

export function buildGsMembershipConfirmationPath(decision: GsMembershipDecision, token: string) {
  return `/mitgliedschaft-bestaetigen/${decision}/${token}`
}

export function createGsMembershipConfirmationLinks(memberId: string, baseUrl: string, maxAgeSeconds?: number) {
  const token = createGsMembershipConfirmationToken(memberId, maxAgeSeconds)
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "")

  return {
    yesLink: `${normalizedBaseUrl}${buildGsMembershipConfirmationPath("ja", token)}`,
    noLink: `${normalizedBaseUrl}${buildGsMembershipConfirmationPath("nein", token)}`,
  }
}

export function verifyGsMembershipConfirmationToken(token: string | null | undefined) {
  if (!token) return null

  const tokenParts = token.split(".")
  const providedSignature = tokenParts.at(-1)

  if (!providedSignature) {
    return null
  }

  const encodedPayload = tokenParts.slice(0, -1).join(".")
  if (!encodedPayload) {
    return null
  }

  const expectedSignature = sign(encodedPayload)
  const provided = Buffer.from(providedSignature)
  const expected = Buffer.from(expectedSignature)

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null
  }

  try {
    let payload: GsMembershipConfirmationPayload | null = null

    if (tokenParts.length === 3) {
      const [encodedMemberId, encodedExpiry] = tokenParts
      const memberId = fromBase64Url(encodedMemberId)
      const exp = Number.parseInt(encodedExpiry, 36)
      payload = { memberId, exp }
    } else if (tokenParts.length === 2) {
      payload = JSON.parse(fromBase64Url(encodedPayload)) as GsMembershipConfirmationPayload
    }

    if (!payload) {
      return null
    }

    if (!payload.memberId || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload
  } catch {
    return null
  }
}