import { NextResponse } from "next/server"
import {
  checkRateLimitAsync,
  clearLoginFailuresAsync,
  delayFailedLogin,
  getLoginLockStateAsync,
  getRequestIp,
  isAllowedOrigin,
  isWithinMaxLength,
  registerLoginFailureAsync,
  sanitizeTextInput,
} from "@/lib/apiSecurity"
import { applyTrainerSessionCookie, clearTrainerSessionCookie, getTrainerSessionMaxAgeMs } from "@/lib/authSession"
import { findTrainerByEmailAndPin } from "@/lib/boxgymDb"
import { createAiSecurityEventSafe } from "@/lib/aiSecurityEventsDb"
import { SECURITY_EVENT_TYPES } from "@/lib/aiSecurity"
import { getActiveAiSecurityBlock } from "@/lib/aiSecurityBlocksDb"
import { reportAppError } from "@/lib/appErrorReporter"

type TrainerAuthBody = {
  email?: string
  pin?: string
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = (await request.json()) as TrainerAuthBody
    const email = sanitizeTextInput(body.email, { lowercase: true, maxLength: 254 })
    const pin = sanitizeTextInput(body.pin, { maxLength: 64 })
    const requestIp = getRequestIp(request)

    // Manuelle IP-Sperre prüfen (defensiv – kein Absturz bei DB-Ausfall)
    if (requestIp) {
      const ipBlock = await getActiveAiSecurityBlock(requestIp)
      if (ipBlock) {
        void createAiSecurityEventSafe({
          type: SECURITY_EVENT_TYPES.MANUAL_BLOCK_HIT,
          route: "/api/trainer-auth",
          ip: requestIp,
          severity: "high",
          detail: "Aktive manuelle IP-Sperre",
          source: "trainer-auth",
        })
        const msg = ipBlock.expires_at
          ? "Zugriff vorübergehend gesperrt. Bitte später erneut versuchen."
          : "Zugriff gesperrt."
        return new NextResponse(msg, { status: 403 })
      }
    }

    const rateLimit = await checkRateLimitAsync(`trainer-auth:${requestIp}`, 5, 15 * 60 * 1000)
    if (!rateLimit.ok) {
      void createAiSecurityEventSafe({
        type: SECURITY_EVENT_TYPES.RATE_LIMIT,
        route: "/api/trainer-auth",
        ip: requestIp,
        severity: "medium",
        detail: "Trainer-Auth Rate-Limit überschritten",
        source: "trainer-auth",
      })
      return new NextResponse("Too many requests", { status: 429 })
    }

    const loginKey = `trainer:${email || "__email__"}`

    const lockState = await getLoginLockStateAsync(loginKey, 10)
    if (lockState.blocked) {
      await delayFailedLogin()
      void createAiSecurityEventSafe({
        type: SECURITY_EVENT_TYPES.LOGIN_LOCK,
        route: "/api/trainer-auth",
        ip: requestIp,
        actor: email || null,
        severity: "high",
        detail: "Trainer-Login gesperrt nach zu vielen Fehlversuchen",
        source: "trainer-auth",
      })
      const minutes = Math.max(1, Math.ceil((lockState.retryAfterMs ?? 0) / 60000))
      return new NextResponse(`Zu viele Fehlversuche. Bitte ${minutes} Minuten warten.`, { status: 429 })
    }

    if (!email || !pin) {
      return new NextResponse("Missing credentials", { status: 400 })
    }

    if (!isWithinMaxLength(email, 254) || !isWithinMaxLength(pin, 64)) {
      return new NextResponse("Invalid credentials", { status: 400 })
    }

    const trainerMatch = await findTrainerByEmailAndPin(email, pin)
    if (!trainerMatch) {
      const result = await registerLoginFailureAsync(loginKey, 10, 15 * 60 * 1000, 15 * 60 * 1000)
      await delayFailedLogin()
      void createAiSecurityEventSafe({
        type: SECURITY_EVENT_TYPES.LOGIN_FAILURE,
        route: "/api/trainer-auth",
        ip: requestIp,
        actor: email || null,
        severity: result.blocked ? "high" : "medium",
        detail: result.blocked
          ? "Trainer-Login gesperrt nach wiederholten Fehlversuchen"
          : `Fehlgeschlagener Trainer-Login (Versuch ${10 - (result.remainingAttempts ?? 0)}/10)`,
        source: "trainer-auth",
      })
      if (result.blocked) {
        return new NextResponse("Zu viele Fehlversuche. Bitte 15 Minuten warten.", { status: 429 })
      }
      return new NextResponse("Trainer credentials invalid", { status: 401 })
    }

    await clearLoginFailuresAsync(loginKey)

    const trainer = trainerMatch
    const role = trainer.role
    const response = NextResponse.json({
      ok: true,
      role,
      accountRole: role,
      linkedMemberId: trainer.linked_member_id ?? null,
      accountEmail: trainer.email,
      accountFirstName: trainer.first_name,
      accountLastName: trainer.last_name,
      sessionUntil: Date.now() + getTrainerSessionMaxAgeMs(),
      mustChangePassword: trainer.mustChangePassword ?? false,
    })

    return await applyTrainerSessionCookie(response, {
      role,
      accountRole: role,
      linkedMemberId: trainer.linked_member_id ?? null,
      accountEmail: trainer.email,
      accountFirstName: trainer.first_name,
      accountLastName: trainer.last_name,
    })
  } catch (error) {
    console.error("trainer-auth failed", error)
    void reportAppError("auth", "unexpected_auth_error", "high", error, { route: "/api/trainer-auth" })
    return new NextResponse("Internal server error", { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  return clearTrainerSessionCookie(response)
}
