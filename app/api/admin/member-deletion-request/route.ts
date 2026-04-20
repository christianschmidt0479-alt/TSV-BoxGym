import { NextResponse } from "next/server"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { cookies } from "next/headers"
import { TRAINER_SESSION_COOKIE, verifyTrainerSessionToken } from "@/lib/authSession"
import { deleteMember } from "@/lib/boxgymDb"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { requestId, action } = body
    if (!requestId || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ ok: false, code: "invalid_input", message: "Ungültige Eingabe." }, { status: 400 })
    }
    // Admin-Session prüfen (direkt, nicht via React-Komponente)
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get?.(TRAINER_SESSION_COOKIE);
    const session = await verifyTrainerSessionToken(sessionCookie?.value);
    const isAdmin = session?.role === "admin" || session?.accountRole === "admin";
    if (!isAdmin) {
      return NextResponse.json({ ok: false, code: "not_admin", message: "Nicht berechtigt." }, { status: 401 })
    }
    const adminId = session?.linkedMemberId || null;
    const supabase = createServerSupabaseServiceClient()
    // Anfrage laden
    const { data: req, error } = await supabase
      .from("member_deletion_requests")
      .select("id, member_id, status")
      .eq("id", requestId)
      .maybeSingle()
    if (error || !req) {
      return NextResponse.json({ ok: false, code: "not_found", message: "Anfrage nicht gefunden." }, { status: 404 })
    }
    if (req.status !== "pending") {
      return NextResponse.json({ ok: false, code: "already_decided", message: "Anfrage wurde bereits bearbeitet." }, { status: 409 })
    }
    if (action === "approve") {
      // Mitglied löschen
      await deleteMember(req.member_id)
      await supabase
        .from("member_deletion_requests")
        .update({ status: "approved", approved_at: new Date().toISOString(), admin_id: adminId, deleted_at: new Date().toISOString() })
        .eq("id", requestId)
      return NextResponse.json({ ok: true, message: "Mitglied gelöscht und Anfrage genehmigt." })
    } else {
      await supabase
        .from("member_deletion_requests")
        .update({ status: "rejected", rejected_at: new Date().toISOString(), admin_id: adminId })
        .eq("id", requestId)
      return NextResponse.json({ ok: true, message: "Anfrage abgelehnt." })
    }
  } catch (error) {
    return NextResponse.json({ ok: false, code: "server_error", message: "Interner Fehler." }, { status: 500 })
  }
}
