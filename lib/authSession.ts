import type { NextRequest, NextResponse } from "next/server"

export const TRAINER_SESSION_COOKIE = "trainer_session"
const SESSION_MAX_AGE_SECONDS = 30 * 60
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type ServerTrainerRole = "admin" | "trainer" | null

export type TrainerSessionPayload = {
  userId?: string
  role: ServerTrainerRole
  accountRole: ServerTrainerRole
  linkedMemberId: string | null
  memberId?: string | null
  isMember?: boolean
  accountEmail: string
  accountFirstName: string
  accountLastName: string
  exp: number
  version: number
}

function getSessionSecret() {
  const secret = process.env.TRAINER_SESSION_SECRET || ""
  if (!secret) {
    throw new Error("Missing TRAINER_SESSION_SECRET")
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

export async function createTrainerSessionToken(input: Omit<TrainerSessionPayload, "exp" | "version">) {
  const payload: TrainerSessionPayload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    version: 2,
  }

  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = await sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export async function verifyTrainerSessionToken(token: string | undefined | null) {
  if (!token) return null

  const [encodedPayload, providedSignature] = token.split(".")

  if (!encodedPayload || !providedSignature) return null

  const expectedSignature = await sign(encodedPayload)

  if (!timingSafeEqualString(providedSignature, expectedSignature)) {
    return null
  }

  try {
    const decoded = fromBase64Url(encodedPayload)
    const payload = JSON.parse(decoded) as TrainerSessionPayload

    if (!payload) return null

    // Reject old tokens (version < 2)
    if (!payload.version || payload.version < 2) {
      return null
    }

    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    if (
      payload.role !== "admin" &&
      payload.role !== "trainer" &&
      payload.isMember !== true
    ) {
      return null
    }
    if (payload.accountRole !== "admin" && payload.accountRole !== "trainer" && payload.accountRole !== null) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

function getCookieValueFromHeader(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(";").map((entry) => entry.trim())
  for (const cookie of cookies) {
    const [cookieName, ...rest] = cookie.split("=")
    if (cookieName === name) {
      return rest.join("=") || null
    }
  }
  return null
}

export async function readTrainerSessionFromRequest(request: NextRequest) {
  return verifyTrainerSessionToken(request.cookies.get(TRAINER_SESSION_COOKIE)?.value)
}

export async function readTrainerSessionFromHeaders(request: Request) {
  return verifyTrainerSessionToken(getCookieValueFromHeader(request.headers.get("cookie"), TRAINER_SESSION_COOKIE))
}

export async function applyTrainerSessionCookie(response: NextResponse, input: Omit<TrainerSessionPayload, "exp" | "version">) {
  const token = await createTrainerSessionToken(input)
  response.cookies.set(TRAINER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}

export function clearTrainerSessionCookie(response: NextResponse) {
  response.cookies.set(TRAINER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
  return response
}

export function getTrainerSessionMaxAgeMs() {
  return SESSION_MAX_AGE_SECONDS * 1000
}
