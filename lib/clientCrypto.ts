"use client"

export async function hashSecret(value: string) {
  const normalized = value.trim()
  const encoded = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest("SHA-256", encoded)

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
