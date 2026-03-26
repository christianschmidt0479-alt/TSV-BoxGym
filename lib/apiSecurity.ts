const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
const loginFailureStore = new Map<string, { count: number; resetAt: number; blockedUntil: number }>()

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "").toLowerCase()
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
  const now = Date.now()
  const current = rateLimitStore.get(key)

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1 }
  }

  if (current.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: current.resetAt - now }
  }

  current.count += 1
  rateLimitStore.set(key, current)
  return { ok: true, remaining: limit - current.count }
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

export function registerLoginFailure(key: string, maxAttempts = 5, windowMs = 15 * 60 * 1000, blockMs = 15 * 60 * 1000) {
  const now = Date.now()
  const current = loginFailureStore.get(key)

  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs, blockedUntil: 0 }
    loginFailureStore.set(key, next)
    return { blocked: false, remainingAttempts: maxAttempts - 1 }
  }

  if (current.blockedUntil > now) {
    return { blocked: true, retryAfterMs: current.blockedUntil - now, remainingAttempts: 0 }
  }

  current.count += 1
  if (current.count >= maxAttempts) {
    current.blockedUntil = now + blockMs
    current.resetAt = now + blockMs
    loginFailureStore.set(key, current)
    return { blocked: true, retryAfterMs: blockMs, remainingAttempts: 0 }
  }

  loginFailureStore.set(key, current)
  return { blocked: false, remainingAttempts: Math.max(0, maxAttempts - current.count) }
}

export function clearLoginFailures(key: string) {
  loginFailureStore.delete(key)
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
