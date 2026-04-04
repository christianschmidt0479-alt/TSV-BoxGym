const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
const loginFailureStore = new Map<string, { count: number; resetAt: number; blockedUntil: number }>()
const distributedRateLimitUrl = process.env.UPSTASH_REDIS_REST_URL?.trim() || ""
const distributedRateLimitToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || ""
const distributedRateLimitPrefix = process.env.RATE_LIMIT_PREFIX?.trim() || "tsvboxgym:ratelimit"
let didWarnPartialDistributedConfig = false
let didWarnStrictRateLimitMode = false

// Non-production environments use relaxed in-memory limits so local dev testing
// doesn't hit rate limits constantly. Production always uses the distributed
// limiter (Upstash) and is completely unaffected by these values.
function isDevEnvironment() {
  return process.env.NODE_ENV !== "production"
}

type SanitizeTextOptions = {
  trim?: boolean
  lowercase?: boolean
  maxLength?: number
}

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "").toLowerCase()
}

function getDistributedRateLimitConfig() {
  if ((distributedRateLimitUrl && !distributedRateLimitToken) || (!distributedRateLimitUrl && distributedRateLimitToken)) {
    if (!didWarnPartialDistributedConfig) {
      didWarnPartialDistributedConfig = true
      console.warn("Distributed rate limiting disabled because only part of the Upstash configuration is set.")
    }
    return null
  }

  if (!distributedRateLimitUrl || !distributedRateLimitToken) {
    return null
  }

  if (!/^https?:\/\//i.test(distributedRateLimitUrl)) {
    if (!didWarnPartialDistributedConfig) {
      didWarnPartialDistributedConfig = true
      console.warn("Distributed rate limiting disabled because UPSTASH_REDIS_REST_URL is invalid.")
    }
    return null
  }

  return {
    url: distributedRateLimitUrl.replace(/\/+$/, ""),
    token: distributedRateLimitToken,
    prefix: distributedRateLimitPrefix,
  }
}

function isDistributedRateLimitRequired() {
  const allowLocalFallback = (process.env.ALLOW_LOCAL_RATE_LIMIT_FALLBACK || "").trim().toLowerCase() === "true"
  return process.env.NODE_ENV === "production" && !allowLocalFallback
}

function warnStrictRateLimitMode(reason: string) {
  if (didWarnStrictRateLimitMode) return
  didWarnStrictRateLimitMode = true
  console.warn(`Strict distributed rate limit mode active: ${reason}`)
}

function unavailableRateLimitResult(windowMs: number) {
  return { ok: false, remaining: 0, retryAfterMs: windowMs, unavailable: true }
}

function unavailableLoginLockState(windowMs = 15 * 60 * 1000) {
  return { blocked: true, retryAfterMs: windowMs, remainingAttempts: 0, unavailable: true }
}

export function sanitizeTextInput(value: unknown, options: SanitizeTextOptions = {}) {
  if (typeof value !== "string") return ""

  let normalized = options.trim === false ? value : value.trim()
  if (options.lowercase) {
    normalized = normalized.toLowerCase()
  }

  if (typeof options.maxLength === "number" && options.maxLength >= 0) {
    normalized = normalized.slice(0, options.maxLength)
  }

  return normalized
}

export function isWithinMaxLength(value: string, maxLength: number) {
  return value.length <= maxLength
}

export async function delayFailedLogin(ms = 500) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function runDistributedPipeline(commands: Array<Array<string>>) {
  const config = getDistributedRateLimitConfig()
  if (!config) return null

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Distributed limiter failed with status ${response.status}`)
  }

  return {
    config,
    payload: (await response.json()) as Array<{ result?: number | string | null }>,
  }
}

export function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

export function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin")
  const requestUrl = new URL(request.url)
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.APP_BASE_URL || ""
  const allowedOrigins = [requestUrl.origin, appBaseUrl].filter(Boolean).map(normalizeOrigin)

  if (origin) {
    return allowedOrigins.includes(normalizeOrigin(origin))
  }

  const referer = request.headers.get("referer")
  if (referer) {
    try {
      return allowedOrigins.includes(normalizeOrigin(new URL(referer).origin))
    } catch {
      return false
    }
  }

  const method = request.method.toUpperCase()
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase()
  if ((method === "GET" || method === "HEAD") && (!secFetchSite || secFetchSite === "same-origin" || secFetchSite === "same-site" || secFetchSite === "none")) {
    return true
  }

  return false
}

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const effectiveLimit = isDevEnvironment() ? limit * 10 : limit
  const effectiveWindowMs = isDevEnvironment() ? Math.max(Math.floor(windowMs / 10), 30_000) : windowMs
  const now = Date.now()
  const current = rateLimitStore.get(key)

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + effectiveWindowMs })
    return { ok: true, remaining: effectiveLimit - 1 }
  }

  if (current.count >= effectiveLimit) {
    return { ok: false, remaining: 0, retryAfterMs: current.resetAt - now }
  }

  current.count += 1
  rateLimitStore.set(key, current)
  return { ok: true, remaining: effectiveLimit - current.count }
}

export async function checkRateLimitAsync(key: string, limit: number, windowMs: number) {
  const distributedKey = `${distributedRateLimitPrefix}:${key}`
  if (!getDistributedRateLimitConfig()) {
    if (isDistributedRateLimitRequired()) {
      warnStrictRateLimitMode("missing distributed limiter configuration")
      return unavailableRateLimitResult(windowMs)
    }
    return checkRateLimit(key, limit, windowMs)
  }

  try {
    const result = await runDistributedPipeline([
      ["SET", distributedKey, "0", "PX", String(windowMs), "NX"],
      ["INCR", distributedKey],
      ["PTTL", distributedKey],
    ])
    if (!result) {
      return checkRateLimit(key, limit, windowMs)
    }

    const payload = result.payload
    const currentCount = Number(payload?.[1]?.result ?? 0)
    const ttlMs = Math.max(0, Number(payload?.[2]?.result ?? windowMs))

    if (!Number.isFinite(currentCount) || currentCount <= 0) {
      throw new Error("Distributed rate limit returned invalid count")
    }

    if (currentCount > limit) {
      return { ok: false, remaining: 0, retryAfterMs: ttlMs }
    }

    return { ok: true, remaining: Math.max(0, limit - currentCount) }
  } catch (error) {
    if (isDistributedRateLimitRequired()) {
      warnStrictRateLimitMode("distributed limiter unavailable")
      return unavailableRateLimitResult(windowMs)
    }
    console.warn("Distributed rate limit unavailable, falling back to local store.", error)
    return checkRateLimit(key, limit, windowMs)
  }
}

export function getLoginLockState(key: string) {
  const current = loginFailureStore.get(key)
  const now = Date.now()

  if (!current) return { blocked: false, remainingAttempts: 5 }

  if (current.blockedUntil > now) {
    return { blocked: true, retryAfterMs: current.blockedUntil - now, remainingAttempts: 0 }
  }

  if (current.resetAt <= now) {
    loginFailureStore.delete(key)
    return { blocked: false, remainingAttempts: 5 }
  }

  return { blocked: false, remainingAttempts: Math.max(0, 5 - current.count) }
}

export async function getLoginLockStateAsync(key: string, maxAttempts = 5) {
  const config = getDistributedRateLimitConfig()
  if (!config) {
    if (isDistributedRateLimitRequired()) {
      warnStrictRateLimitMode("missing distributed login lock configuration")
      return unavailableLoginLockState()
    }
    return getLoginLockState(key)
  }

  const distributedKey = `${config.prefix}:login:${key}`

  try {
    const result = await runDistributedPipeline([
      ["GET", distributedKey],
      ["PTTL", distributedKey],
    ])
    if (!result) {
      return getLoginLockState(key)
    }

    const rawValue = typeof result.payload?.[0]?.result === "string" ? result.payload[0].result : ""
    const ttlMs = Math.max(0, Number(result.payload?.[1]?.result ?? 0))
    if (!rawValue) {
      return { blocked: false, remainingAttempts: maxAttempts }
    }

    const now = Date.now()
    const current = JSON.parse(rawValue) as { count?: number; resetAt?: number; blockedUntil?: number }

    if ((current.blockedUntil ?? 0) > now) {
      return { blocked: true, retryAfterMs: (current.blockedUntil ?? now) - now, remainingAttempts: 0 }
    }

    if ((current.resetAt ?? 0) <= now || ttlMs <= 0) {
      return { blocked: false, remainingAttempts: maxAttempts }
    }

    return {
      blocked: false,
      remainingAttempts: Math.max(0, maxAttempts - (current.count ?? 0)),
    }
  } catch (error) {
    if (isDistributedRateLimitRequired()) {
      warnStrictRateLimitMode("distributed login lock unavailable")
      return unavailableLoginLockState()
    }
    console.warn("Distributed login lock unavailable, falling back to local store.", error)
    return getLoginLockState(key)
  }
}

export function registerLoginFailure(key: string, maxAttempts = 5, windowMs = 15 * 60 * 1000, blockMs = 15 * 60 * 1000) {
  // In dev: 1-min block window instead of 15 min so test logins don't stay locked.
  const effectiveBlockMs = isDevEnvironment() ? 60_000 : blockMs
  const effectiveWindowMs = isDevEnvironment() ? 60_000 : windowMs
  const now = Date.now()
  const current = loginFailureStore.get(key)

  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + effectiveWindowMs, blockedUntil: 0 }
    loginFailureStore.set(key, next)
    return { blocked: false, remainingAttempts: maxAttempts - 1 }
  }

  if (current.blockedUntil > now) {
    return { blocked: true, retryAfterMs: current.blockedUntil - now, remainingAttempts: 0 }
  }

  current.count += 1
  if (current.count >= maxAttempts) {
    current.blockedUntil = now + effectiveBlockMs
    current.resetAt = now + effectiveBlockMs
    loginFailureStore.set(key, current)
    return { blocked: true, retryAfterMs: effectiveBlockMs, remainingAttempts: 0 }
  }

  loginFailureStore.set(key, current)
  return { blocked: false, remainingAttempts: Math.max(0, maxAttempts - current.count) }
}

export async function registerLoginFailureAsync(key: string, maxAttempts = 5, windowMs = 15 * 60 * 1000, blockMs = 15 * 60 * 1000) {
  const config = getDistributedRateLimitConfig()
  if (!config) {
    if (isDistributedRateLimitRequired()) {
      warnStrictRateLimitMode("missing distributed login failure configuration")
      return unavailableLoginLockState(blockMs)
    }
    return registerLoginFailure(key, maxAttempts, windowMs, blockMs)
  }

  const distributedKey = `${config.prefix}:login:${key}`

  try {
    const result = await runDistributedPipeline([
      ["GET", distributedKey],
      ["PTTL", distributedKey],
    ])
    if (!result) {
      return registerLoginFailure(key, maxAttempts, windowMs, blockMs)
    }

    const now = Date.now()
    const rawValue = typeof result.payload?.[0]?.result === "string" ? result.payload[0].result : ""
    const current = rawValue
      ? (JSON.parse(rawValue) as { count?: number; resetAt?: number; blockedUntil?: number })
      : null

    if (!current || (current.resetAt ?? 0) <= now) {
      const next = { count: 1, resetAt: now + windowMs, blockedUntil: 0 }
      await runDistributedPipeline([
        ["SET", distributedKey, JSON.stringify(next), "PX", String(windowMs)],
      ])
      return { blocked: false, remainingAttempts: maxAttempts - 1 }
    }

    if ((current.blockedUntil ?? 0) > now) {
      return { blocked: true, retryAfterMs: (current.blockedUntil ?? now) - now, remainingAttempts: 0 }
    }

    const nextCount = (current.count ?? 0) + 1
    if (nextCount >= maxAttempts) {
      const next = { count: nextCount, resetAt: now + blockMs, blockedUntil: now + blockMs }
      await runDistributedPipeline([
        ["SET", distributedKey, JSON.stringify(next), "PX", String(blockMs)],
      ])
      return { blocked: true, retryAfterMs: blockMs, remainingAttempts: 0 }
    }

    const next = {
      count: nextCount,
      resetAt: current.resetAt ?? now + windowMs,
      blockedUntil: 0,
    }
    const ttlMs = Math.max(1, (current.resetAt ?? now + windowMs) - now)
    await runDistributedPipeline([
      ["SET", distributedKey, JSON.stringify(next), "PX", String(ttlMs)],
    ])

    return { blocked: false, remainingAttempts: Math.max(0, maxAttempts - nextCount) }
  } catch (error) {
    if (isDistributedRateLimitRequired()) {
      warnStrictRateLimitMode("distributed login failure tracking unavailable")
      return unavailableLoginLockState(blockMs)
    }
    console.warn("Distributed login lock unavailable, falling back to local store.", error)
    return registerLoginFailure(key, maxAttempts, windowMs, blockMs)
  }
}

export function clearLoginFailures(key: string) {
  loginFailureStore.delete(key)
}

export async function clearLoginFailuresAsync(key: string) {
  const config = getDistributedRateLimitConfig()
  if (!config) {
    clearLoginFailures(key)
    return
  }

  try {
    await runDistributedPipeline([["DEL", `${config.prefix}:login:${key}`]])
  } catch (error) {
    console.warn("Distributed login lock clear failed, falling back to local store.", error)
  }

  clearLoginFailures(key)
}

export function isAllowedAppLink(link: string, request: Request) {
  try {
    const candidate = new URL(link)
    const requestUrl = new URL(request.url)
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.APP_BASE_URL || requestUrl.origin
    const allowedOrigins = [requestUrl.origin, appBaseUrl].map(normalizeOrigin)

    return allowedOrigins.includes(normalizeOrigin(candidate.origin))
  } catch {
    return false
  }
}
