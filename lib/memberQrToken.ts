import { randomBytes } from "crypto"

/**
 * Generates a cryptographically secure, URL-safe QR token (32 hex chars = 128 bit).
 * No hyphens, no ambiguous characters – safe to embed in a QR code as a plain string.
 */
export function generateMemberQrToken(): string {
  return randomBytes(16).toString("hex")
}

/**
 * Resets the QR token for a member (admin helper).
 * Import and call from an admin API route that already validates the caller's auth.
 */
export async function resetMemberQrToken(
  supabase: { from: (table: string) => unknown },
  memberId: string
): Promise<string> {
  const token = generateMemberQrToken()
  const db = supabase.from("members") as {
    update: (data: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message?: string } | null }>
    }
  }
  const { error } = await db.update({ member_qr_token: token }).eq("id", memberId)
  if (error) throw error
  return token
}
