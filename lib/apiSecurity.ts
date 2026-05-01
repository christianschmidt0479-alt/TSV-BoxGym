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

function isLoopbackHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1"
}

function buildLoopbackAliases(origin: string) {
  try {
    const url = new URL(origin)
    if (!isLoopbackHost(url.hostname)) return []

    const port = url.port ? `:${url.port}` : ""
    return [
      `${url.protocol}//localhost${port}`,
      `${url.protocol}//127.0.0.1${port}`,
    ].map(normalizeOrigin)
  } catch {
    return []
  }
}

function getAllowedOrigins(request: Request) {
  const requestUrl = new URL(request.url)
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.APP_BASE_URL || ""
  const forwardedHost = sanitizeTextInput(request.headers.get("x-forwarded-host"), { maxLength: 255 })
  const host = sanitizeTextInput(request.headers.get("host"), { maxLength: 255 })
  const forwardedProto = sanitizeTextInput(request.headers.get("x-forwarded-proto"), { maxLength: 20 }) || requestUrl.protocol.replace(/:$/, "")
  const directHostOrigin = host ? `${forwardedProto}://${host}` : ""
  const forwardedHostOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : ""

  const allowedOrigins = new Set<string>()
  for (const value of [requestUrl.origin, appBaseUrl, directHostOrigin, forwardedHostOrigin]) {
    if (!value) continue
    allowedOrigins.add(normalizeOrigin(value))
    for (const alias of buildLoopbackAliases(value)) {
      allowedOrigins.add(alias)
    }
  }

  return Array.from(allowedOrigins)
}

function logOriginDecision(
  request: Request,
  allowedOrigins: string[],
  decision: "ALLOW" | "BLOCK",
  reason: string
) {
  if (process.env.NODE_ENV === "production") return

  const payload = {
    method: request.method,
    url: request.url,
    origin: request.headers.get("origin") || "",
    referer: request.headers.get("referer") || "",
    host: request.headers.get("host") || "",
    forwardedHost: request.headers.get("x-forwarded-host") || "",
    forwardedProto: request.headers.get("x-forwarded-proto") || "",
    secFetchSite: request.headers.get("sec-fetch-site") || "",
    allowedOrigins,
    decision,
    reason,
  }

  if (decision === "BLOCK") {
    console.warn("[apiSecurity.isAllowedOrigin] BLOCK", payload)
    return
  }
}

function isDevLocalhost3000Host(request: Request) {
  if (process.env.NODE_ENV === "production") return false
  const host = sanitizeTextInput(request.headers.get("host"), { lowercase: true, maxLength: 255 })
  return host === "localhost:3000"
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
  const origin = sanitizeTextInput(request.headers.get("origin"), { maxLength: 2048 })
  const referer = sanitizeTextInput(request.headers.get("referer"), { maxLength: 2048 })
  const allowedOrigins = getAllowedOrigins(request)

  if (origin) {
    const allowed = allowedOrigins.includes(normalizeOrigin(origin))
    if (!allowed) logOriginDecision(request, allowedOrigins, "BLOCK", "origin_not_allowed")
    else logOriginDecision(request, allowedOrigins, "ALLOW", "origin_match")
    return allowed
  }

  if (referer) {
    const normalizedReferer = normalizeOrigin(referer)
    const allowedByRefererContains = allowedOrigins.some((allowedOrigin) => normalizedReferer.includes(allowedOrigin))
    if (allowedByRefererContains) {
      logOriginDecision(request, allowedOrigins, "ALLOW", "referer_contains_allowed_origin")
      return true
    }

    logOriginDecision(request, allowedOrigins, "BLOCK", "referer_not_allowed")
    return false
  }

  if (isDevLocalhost3000Host(request)) {
    logOriginDecision(request, allowedOrigins, "ALLOW", "dev_missing_origin_referer_localhost_host_fallback")
    return true
  }

  const method = request.method.toUpperCase()
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase()
  if ((method === "GET" || method === "HEAD") && (!secFetchSite || secFetchSite === "same-origin" || secFetchSite === "same-site" || secFetchSite === "none")) {
    logOriginDecision(request, allowedOrigins, "ALLOW", "safe_method_without_origin_or_referer")
    return true
  }

  logOriginDecision(request, allowedOrigins, "BLOCK", "missing_origin_and_referer")
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
