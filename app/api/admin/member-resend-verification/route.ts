import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { findMemberById, updateMemberRegistrationData } from "@/lib/boxgymDb"
import { sendMemberVerificationMail } from "@/lib/mail/memberVerificationMail"

// Nur POST erlaubt, nur Admin (Auth-Check ggf. nachrüsten)
export async function POST(req: NextRequest) {
  const { member_id } = await req.json()
  if (!member_id || typeof member_id !== "string") {
    return NextResponse.json({ ok: false, error: "member_id fehlt" }, { status: 400 })
  }

  // Mitglied laden
  const member = await findMemberById(member_id)
  if (!member) {
    return NextResponse.json({ ok: false, error: "Mitglied nicht gefunden" }, { status: 404 })
  }
  if (!member.email || member.email_verified) {
    return NextResponse.json({ ok: false, error: "E-Mail fehlt oder bereits bestätigt" }, { status: 400 })
  }

  // Neuen Token und Ablaufzeit erzeugen
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  try {
    await updateMemberRegistrationData(member.id, {
      email_verification_token: token,
      email_verification_expires_at: expiresAt,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Token konnte nicht gespeichert werden" }, { status: 500 })
  }

  // Mail senden
  try {
    await sendMemberVerificationMail({ email: member.email.trim().toLowerCase(), token })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Mail konnte nicht gesendet werden" }, { status: 500 })
  }
}
