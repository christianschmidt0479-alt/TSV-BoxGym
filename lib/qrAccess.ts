import type { NextResponse } from "next/server"

export const QR_ACCESS_PUBLIC_PATH = "/checkin"
export const QR_ACCESS_PARAM = "gym"
export const QR_ACCESS_STORAGE_KEY = "tsv_qr_access_until"
export const QR_ACCESS_COOKIE = "tsv_qr_access"
export const QR_ACCESS_HEADER = "x-qr-access-token"
export const QR_ACCESS_MINUTES = 180

const QR_ACCESS_MAX_AGE_SECONDS = QR_ACCESS_MINUTES * 60
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type QrAccessPanel = "member" | "trial"

export type QrAccessPayload = {
	panel: QrAccessPanel
	exp: number
}

export function getQrAccessExpiryStorageKey(panel: QrAccessPanel) {
	return `${QR_ACCESS_STORAGE_KEY}_${panel}`
}

export function getQrAccessTokenStorageKey(panel: QrAccessPanel) {
	return `${QR_ACCESS_COOKIE}_${panel}`
}

function getQrAccessSessionSecret() {
	const secret =
		process.env.QR_ACCESS_SESSION_SECRET ||
		process.env.MEMBER_DEVICE_SESSION_SECRET ||
		process.env.TRAINER_SESSION_SECRET ||
		""

	if (!secret) {
		throw new Error("Missing QR_ACCESS_SESSION_SECRET")
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
		encoder.encode(getQrAccessSessionSecret()),
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

export async function createQrAccessToken(panel: QrAccessPanel) {
	const payload: QrAccessPayload = {
		panel,
		exp: Math.floor(Date.now() / 1000) + QR_ACCESS_MAX_AGE_SECONDS,
	}

	const encodedPayload = toBase64Url(JSON.stringify(payload))
	const signature = await sign(encodedPayload)
	return `${encodedPayload}.${signature}`
}

export async function verifyQrAccessToken(token: string | undefined | null) {
	if (!token) return null

	const [encodedPayload, providedSignature] = token.split(".")
	if (!encodedPayload || !providedSignature) return null

	const expectedSignature = await sign(encodedPayload)
	if (!timingSafeEqualString(providedSignature, expectedSignature)) {
		return null
	}

	try {
		const payload = JSON.parse(fromBase64Url(encodedPayload)) as QrAccessPayload
		if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
			return null
		}
		if (payload.panel !== "member" && payload.panel !== "trial") {
			return null
		}
		return payload
	} catch {
		return null
	}
}

export async function readQrAccessFromHeaders(request: Request) {
	const cookieAccess = await verifyQrAccessToken(getCookieValueFromHeader(request.headers.get("cookie"), QR_ACCESS_COOKIE))
	if (cookieAccess) {
		return cookieAccess
	}

	const headerToken = request.headers.get(QR_ACCESS_HEADER)?.trim() ?? ""
	return verifyQrAccessToken(headerToken)
}

export async function applyQrAccessCookie(response: NextResponse, panel: QrAccessPanel) {
	const token = await createQrAccessToken(panel)
	response.cookies.set(QR_ACCESS_COOKIE, token, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: QR_ACCESS_MAX_AGE_SECONDS,
	})
	return response
}

export function clearQrAccessCookie(response: NextResponse) {
	response.cookies.set(QR_ACCESS_COOKIE, "", {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: 0,
	})
	return response
}
