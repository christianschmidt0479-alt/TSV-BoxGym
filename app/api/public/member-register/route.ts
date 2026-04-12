
import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { parseTrainingGroup } from "@/lib/trainingGroups"
import { registerMemberService } from "@/lib/memberRegisterService"

export async function POST(request: Request) {
    //
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await request.json()
    //
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

    //
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
    // Fehler-Log nur in dev
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error("[member-register] failed", error)
    }
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
