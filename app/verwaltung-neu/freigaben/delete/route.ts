// Placeholder-API, damit Route nicht bricht
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.json({ error: "Nicht implementiert" }, { status: 501 });
}
