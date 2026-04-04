import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { writeAdminAuditLog } from "@/lib/adminAuditLogDb"
import { findTrainerByEmail, updateTrainerAccountPin } from "@/lib/trainerDb"
import { ADMIN_PASSWORD_REQUIREMENTS_MESSAGE, isTrainerPinCompliant, verifyTrainerPinHash } from "@/lib/trainerPin"
import { createAiSecurityEventSafe } from "@/lib/aiSecurityEventsDb"
import { SECURITY_EVENT_TYPES } from "@/lib/aiSecurity"

type ChangeAdminPasswordBody = {
  currentPassword?: string
  newPassword?: string
}

export async function PUT(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      void createAiSecurityEventSafe({
        type: SECURITY_EVENT_TYPES.AUTH_DENIED,
        route: "/api/admin/account-password",
        ip: getRequestIp(request),
        severity: "high",
        detail: "Unbefugter Zugriffsversuch auf Admin-Passwortänderung",
        source: "admin/account-password",
      })
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`admin-account-password:${getRequestIp(request)}`, 10, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as ChangeAdminPasswordBody
    const currentPassword = body.currentPassword?.trim() ?? ""
    const newPassword = body.newPassword?.trim() ?? ""

    if (!currentPassword || !newPassword) {
      return new NextResponse("Bitte aktuelles und neues Passwort angeben.", { status: 400 })
    }

    if (!isTrainerPinCompliant(newPassword)) {
      return new NextResponse(ADMIN_PASSWORD_REQUIREMENTS_MESSAGE, { status: 400 })
    }

    const trainer = await findTrainerByEmail(session.accountEmail)
    if (!trainer || trainer.role !== "admin") {
      return new NextResponse("Admin-Konto nicht gefunden.", { status: 404 })
    }

    const isCurrentPasswordValid = await verifyTrainerPinHash(currentPassword, trainer.password_hash)
    if (!isCurrentPasswordValid) {
      return new NextResponse("Aktuelles Passwort ist nicht korrekt.", { status: 401 })
    }

    await updateTrainerAccountPin(trainer.id, newPassword)

    await writeAdminAuditLog({
      session,
      action: "admin_password_changed",
      targetType: "trainer_account",
      targetId: trainer.id,
      targetName: trainer.email,
      details: "Admin-Passwort im Bereich Einstellungen geändert.",
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("admin account password update failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}