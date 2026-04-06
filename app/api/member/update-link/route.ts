import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin, sanitizeTextInput } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createMemberUpdateLink, readMemberUpdateLinkStatus, unlockMemberUpdateProfile, updateMemberViaToken } from "@/lib/memberUpdateTokens"

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function GET(request: Request) {
  try {
    const token = sanitizeTextInput(new URL(request.url).searchParams.get("token"), { maxLength: 200 })
    if (!token) {
      return jsonError("Token fehlt.", 400)
    }

    const result = await readMemberUpdateLinkStatus(token)
    return NextResponse.json(result, { status: result.valid ? 200 : 404 })
  } catch (error) {
    console.error("member update link GET failed", error)
    return jsonError(error instanceof Error ? error.message : "Interner Fehler", 500)
  }
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`member-update-link-create:${getRequestIp(request)}`, 40, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as { member_id?: string }
    const memberId = sanitizeTextInput(body.member_id, { maxLength: 64 })
    if (!memberId) {
      return jsonError("member_id fehlt.", 400)
    }

    const result = await createMemberUpdateLink(memberId)
    return NextResponse.json({ ok: true, url: result.url, expiresAt: result.expiresAt })
  } catch (error) {
    console.error("member update link POST failed", error)
    return jsonError(error instanceof Error ? error.message : "Interner Fehler", 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const rateLimit = await checkRateLimitAsync(`member-update-link-unlock:${getRequestIp(request)}`, 12, 15 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as { token?: string; password?: string }
    const token = sanitizeTextInput(body.token, { maxLength: 200 })
    const password = sanitizeTextInput(body.password, { maxLength: 64 })

    if (!token || !password) {
      return jsonError("Token und Passwort sind erforderlich.", 400)
    }

    const result = await unlockMemberUpdateProfile(token, password)
    if (!result.ok) {
      return jsonError(result.message || "Passwortprüfung fehlgeschlagen.", result.status ?? 401)
    }

    return NextResponse.json({ ok: true, member: result.member })
  } catch (error) {
    console.error("member update link PATCH failed", error)
    return jsonError(error instanceof Error ? error.message : "Interner Fehler", 500)
  }
}

export async function PUT(request: Request) {
  try {
    const rateLimit = await checkRateLimitAsync(`member-update-link-save:${getRequestIp(request)}`, 12, 15 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as {
      token?: string
      password?: string
      firstName?: string
      lastName?: string
      birthdate?: string
      phone?: string
      baseGroup?: string
      guardianName?: string
    }

    const token = sanitizeTextInput(body.token, { maxLength: 200 })
    const password = sanitizeTextInput(body.password, { maxLength: 64 })
    const firstName = sanitizeTextInput(body.firstName, { maxLength: 80 })
    const lastName = sanitizeTextInput(body.lastName, { maxLength: 80 })
    const birthdate = sanitizeTextInput(body.birthdate, { maxLength: 10 })
    const phone = sanitizeTextInput(body.phone, { maxLength: 40 })
    const baseGroup = sanitizeTextInput(body.baseGroup, { maxLength: 80 })
    const guardianName = sanitizeTextInput(body.guardianName, { maxLength: 120 })

    if (!token || !password || !firstName || !lastName || !birthdate) {
      return jsonError("Vorname, Nachname, Geburtsdatum, Token und Passwort sind erforderlich.", 400)
    }

    const result = await updateMemberViaToken({
      token,
      password,
      firstName,
      lastName,
      birthdate,
      phone: phone || undefined,
      baseGroup: baseGroup || undefined,
      guardianName: guardianName || undefined,
    })

    if (!result.ok) {
      return jsonError(result.message || "Speichern fehlgeschlagen.", result.status ?? 400)
    }

    return NextResponse.json({ ok: true, member: result.member })
  } catch (error) {
    console.error("member update link PUT failed", error)
    return jsonError(error instanceof Error ? error.message : "Interner Fehler", 500)
  }
}