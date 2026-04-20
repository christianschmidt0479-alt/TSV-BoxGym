import { NextRequest, NextResponse } from "next/server";
import { handleDeleteMemberServer } from "../actions";

export async function POST(req: NextRequest) {
  const { memberId } = await req.json();
  if (!memberId) return NextResponse.json({ error: "Missing memberId" }, { status: 400 });
  const result = await handleDeleteMemberServer(memberId);
  if (result?.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result?.error || "Fehler" }, { status: 403 });
}
