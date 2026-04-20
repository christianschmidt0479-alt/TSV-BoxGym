import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { updateMemberRegistrationData, findMemberById } from "@/lib/boxgymDb";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: memberId } = await params;
  if (!memberId) return NextResponse.json({ error: "Missing memberId" }, { status: 400 });
  const member = await findMemberById(memberId);
  if (!member) return NextResponse.json({ error: "Mitglied nicht gefunden" }, { status: 404 });
  // Falls schon Token vorhanden, gib ihn zurück
  if (member.email_verification_token) {
    return NextResponse.json({ token: member.email_verification_token });
  }
  // Token erzeugen und speichern
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  await updateMemberRegistrationData(memberId, {
    email_verification_token: token,
    email_verification_expires_at: expiresAt,
  });
  return NextResponse.json({ token });
}