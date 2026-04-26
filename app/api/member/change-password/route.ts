import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { setMemberPinOnly } from "@/lib/boxgymDb"
import { applyMemberAreaSessionCookie, readMemberAreaSessionFromHeaders } from "@/lib/publicAreaSession"

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    }

    const memberSession = await readMemberAreaSessionFromHeaders(request)
    if (!memberSession?.memberId) {
      return NextResponse.json({ ok: false, error: "Nicht eingeloggt." }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { password?: string; confirmPassword?: string } | null
    const password = typeof body?.password === "string" ? body.password.trim() : ""
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword.trim() : ""

    if (!password || password.length < 6) {
      return NextResponse.json({ ok: false, error: "Passwort muss mindestens 6 Zeichen lang sein." }, { status: 400 })
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ ok: false, error: "Die beiden Passwörter stimmen nicht überein." }, { status: 400 })
    }

    await setMemberPinOnly(memberSession.memberId, password)

    const response = NextResponse.json({ ok: true })
    return applyMemberAreaSessionCookie(response, {
      memberId: memberSession.memberId,
      email: memberSession.email,
      needsPasswordUpdate: false,
    })
  } catch {
    return NextResponse.json({ ok: false, error: "Passwort konnte nicht geändert werden." }, { status: 500 })
  }
}
