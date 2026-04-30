
import { NextResponse } from "next/server"
import { readTrainerSessionFromRequest } from "@/lib/authSession"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { updateTrainerAccountPin } from "@/lib/trainerDb"
import { TRAINER_PIN_REGEX } from "@/lib/trainerPin"

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const session = await readTrainerSessionFromRequest(request as any)
  if (!session || !session.linkedMemberId) {
    return new NextResponse("Nicht eingeloggt.", { status: 401 })
  }

  const { newPassword } = await request.json()
  if (typeof newPassword !== "string" || !TRAINER_PIN_REGEX.test(newPassword)) {
    return new NextResponse("Ungültiges Passwort.", { status: 400 })
  }

  try {
    await updateTrainerAccountPin(session.linkedMemberId, newPassword)
    // Marker entfernen
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trainer_accounts?id=eq.${session.linkedMemberId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({ email_verification_token: null }),
      }
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return new NextResponse("Fehler beim Speichern.", { status: 500 })
  }
}

