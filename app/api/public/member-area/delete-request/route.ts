import { NextResponse } from "next/server"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { readMemberAreaSessionFromHeaders } from "@/lib/publicAreaSession"
import { findMemberById } from "@/lib/boxgymDb"
import { verifyAuthSecret } from "@/lib/authSecret"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const password = (body.password || "").trim()
    if (!password) {
      return NextResponse.json({ ok: false, code: "missing_password", message: "Bitte Passwort eingeben." }, { status: 400 })
    }
    const session = await readMemberAreaSessionFromHeaders(request)
    if (!session) {
      return NextResponse.json({ ok: false, code: "not_logged_in", message: "Nicht eingeloggt." }, { status: 401 })
    }
    const supabase = createServerSupabaseServiceClient()
    const { data: member, error } = await supabase
      .from("members")
      .select("id, member_pin")
      .eq("id", session.memberId)
      .maybeSingle()
    if (error || !member) {
      return NextResponse.json({ ok: false, code: "not_found", message: "Mitglied nicht gefunden." }, { status: 404 })
    }
    const passwordOk = await verifyAuthSecret(password, member.member_pin)
    if (!passwordOk) {
      return NextResponse.json({ ok: false, code: "invalid_password", message: "Passwort falsch." }, { status: 401 })
    }
    // Prüfe auf offene Anfrage
    const { data: existing, error: reqError } = await supabase
      .from("member_deletion_requests")
      .select("id, status")
      .eq("member_id", member.id)
      .eq("status", "pending")
      .maybeSingle()
    if (reqError) {
      return NextResponse.json({ ok: false, code: "db_error", message: "Fehler beim Prüfen bestehender Anfragen." }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({ ok: false, code: "already_requested", message: "Es existiert bereits eine offene Löschanfrage." }, { status: 409 })
    }
    // Neue Anfrage anlegen
    const { error: insertError } = await supabase
      .from("member_deletion_requests")
      .insert({ member_id: member.id, status: "pending" })
    if (insertError) {
      return NextResponse.json({ ok: false, code: "db_error", message: "Fehler beim Speichern der Anfrage." }, { status: 500 })
    }
    return NextResponse.json({ ok: true, message: "Löschanfrage erfolgreich gestellt." })
  } catch (error) {
    return NextResponse.json({ ok: false, code: "server_error", message: "Interner Fehler." }, { status: 500 })
  }
}
