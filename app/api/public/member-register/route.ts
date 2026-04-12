
import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { parseTrainingGroup } from "@/lib/trainingGroups"
import { registerMemberService } from "@/lib/memberRegisterService"

export async function POST(request: Request) {
    // Build-/Trace-Marker für Production-Log
    console.log("MEMBER_REGISTER_TRACE 2026-04-12-A")
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await request.json()
    // Logging: Request-Email, Passwort vorhanden, Länge
    console.log("MEMBER_REGISTER_ROUTE_PASSWORD_PRESENT", {
      email: body.email,
      password_present: !!body.password,
      password_length: body.password ? String(body.password).length : 0
    })
    // Nur relevante Felder für den Service normalisieren
    const parsedGroup = parseTrainingGroup(body.baseGroup)
    const input = {
      firstName: body.firstName?.trim() ?? "",
      lastName: body.lastName?.trim() ?? "",
      birthDate: body.birthDate?.trim() ?? "",
      gender: body.gender?.trim() ?? "",
      password: body.password?.trim() ?? body.pin?.trim() ?? "",
      email: body.email?.trim() ?? "",
      phone: body.phone?.trim() ?? "",
      baseGroup: typeof parsedGroup === "string" ? parsedGroup : "",
      consent: body.consent === true,
    }

    // Debug-Log: Start der Route
    console.log("MEMBER_REGISTER_ROUTE_START", { email: input.email })
    const result = await registerMemberService(input)

    switch (result.status) {
      case "success":
        return NextResponse.json({ ok: true, memberId: result.memberId })
      case "already-exists":
        return new NextResponse("Zu diesem Mitglied existiert bereits ein Zugang. Bitte Mein Bereich nutzen oder Trainer/Admin ansprechen.", { status: 409 })
      case "validation-error":
        return new NextResponse(result.error, { status: 400 })
      case "mail-failed":
        return NextResponse.json({ ok: false, error: result.error, memberId: result.memberId })
      case "error":
      default:
        return new NextResponse(result.error || "Interner Fehler", { status: 500 })
    }
  } catch (error) {
    console.error("[member-register] failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
