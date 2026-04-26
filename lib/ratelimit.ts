import { checkRateLimitAsync } from "@/lib/apiSecurity"

const DEFAULT_LIMIT = 60
const DEFAULT_WINDOW_MS = 60 * 1000

function normalizeKey(input: string | null | undefined) {
  const raw = (input ?? "unknown").split(",")[0]?.trim() || "unknown"
  return raw.toLowerCase()
}

export const ratelimit = {
  async limit(identifier: string | null | undefined) {
    const key = normalizeKey(identifier)
    const result = await checkRateLimitAsync(`global:${key}`, DEFAULT_LIMIT, DEFAULT_WINDOW_MS)
    return {
      success: result.ok,
      remaining: result.remaining,
      retryAfterMs: result.retryAfterMs,
    }
  },
}
