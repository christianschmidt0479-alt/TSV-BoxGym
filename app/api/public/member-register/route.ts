
import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { parseTrainingGroup } from "@/lib/trainingGroups"
import { registerMemberService } from "@/lib/memberRegisterService"

export async function POST(request: Request) {
    //
  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
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

    if (process.env.NODE_ENV !== "production") {
      console.log("REGISTER INPUT:", input)
    }

    //
    const result = await registerMemberService(input)
    if (process.env.NODE_ENV !== "production") {
      console.log("REGISTER RESULT:", result)
    }

    if (result.ok) {
      const mailResult = { sent: result.mailSent }
      return NextResponse.json({
        ok: true,
        memberId: result.memberId,
        mailSent: mailResult.sent,
      })
    }

    if (result.code === "already-exists") {
      return NextResponse.json({
        ok: false,
        error: result.error,
      }, { status: 409 })
    }

    if (result.code === "validation-error") {
      return NextResponse.json({
        ok: false,
        error: result.error,
      }, { status: 400 })
    }

    return NextResponse.json({
      ok: false,
      error: result.error || "Interner Fehler",
    }, { status: 500 })
  } catch (error) {
    // Fehler-Log nur in dev
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error("[member-register] failed", error)
    }
    return NextResponse.json({ ok: false, error: "Interner Fehler" }, { status: 500 })
  }
}
