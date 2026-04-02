import type { NextResponse } from "next/server"

export const MEMBER_AREA_SESSION_COOKIE = "tsv_member_area_session"
export const PARENT_AREA_SESSION_COOKIE = "tsv_parent_area_session"

const SESSION_MAX_AGE_SECONDS = 60 * 60
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type MemberAreaSessionPayload = {
  memberId: string
  email: string
  exp: number
}

export type ParentAreaSessionPayload = {
  parentAccountId: string
  email: string
  exp: number
}

function getSessionSecret() {
  const secret =
    process.env.PUBLIC_AREA_SESSION_SECRET ||
    process.env.TRAINER_SESSION_SECRET ||
    ""

  if (!secret) {
    throw new Error("Missing PUBLIC_AREA_SESSION_SECRET")
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

async function createSignedToken<T extends { exp: number }>(input: Omit<T, "exp">) {
  const payload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  } as T

  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = await sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

async function verifySignedToken<T extends { exp: number }>(
  token: string | undefined | null,
  validate: (payload: T) => boolean
) {
  if (!token) return null

  const [encodedPayload, providedSignature] = token.split(".")
  if (!encodedPayload || !providedSignature) return null

  const expectedSignature = await sign(encodedPayload)
  if (!timingSafeEqualString(providedSignature, expectedSignature)) {
    return null
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as T
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    return validate(payload) ? payload : null
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

function applyCookie(response: NextResponse, name: string, value: string, maxAge = SESSION_MAX_AGE_SECONDS) {
  response.cookies.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  })
  return response
}

export async function createMemberAreaSessionToken(input: Omit<MemberAreaSessionPayload, "exp">) {
  return createSignedToken<MemberAreaSessionPayload>(input)
}

export async function verifyMemberAreaSessionToken(token: string | undefined | null) {
  return verifySignedToken<MemberAreaSessionPayload>(token, (payload) => Boolean(payload.memberId && payload.email))
}

export async function readMemberAreaSessionFromHeaders(request: Request) {
  return verifyMemberAreaSessionToken(getCookieValueFromHeader(request.headers.get("cookie"), MEMBER_AREA_SESSION_COOKIE))
}

export async function applyMemberAreaSessionCookie(response: NextResponse, input: Omit<MemberAreaSessionPayload, "exp">) {
  return applyCookie(response, MEMBER_AREA_SESSION_COOKIE, await createMemberAreaSessionToken(input))
}

export function clearMemberAreaSessionCookie(response: NextResponse) {
  return applyCookie(response, MEMBER_AREA_SESSION_COOKIE, "", 0)
}

export async function createParentAreaSessionToken(input: Omit<ParentAreaSessionPayload, "exp">) {
  return createSignedToken<ParentAreaSessionPayload>(input)
}

export async function verifyParentAreaSessionToken(token: string | undefined | null) {
  return verifySignedToken<ParentAreaSessionPayload>(token, (payload) => Boolean(payload.parentAccountId && payload.email))
}

export async function readParentAreaSessionFromHeaders(request: Request) {
  return verifyParentAreaSessionToken(getCookieValueFromHeader(request.headers.get("cookie"), PARENT_AREA_SESSION_COOKIE))
}

export async function applyParentAreaSessionCookie(response: NextResponse, input: Omit<ParentAreaSessionPayload, "exp">) {
  return applyCookie(response, PARENT_AREA_SESSION_COOKIE, await createParentAreaSessionToken(input))
}

export function clearParentAreaSessionCookie(response: NextResponse) {
  return applyCookie(response, PARENT_AREA_SESSION_COOKIE, "", 0)
}

export function getPublicAreaSessionMaxAgeMs() {
  return SESSION_MAX_AGE_SECONDS * 1000
}
