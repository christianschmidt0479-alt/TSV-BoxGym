import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/mein-bereich", request.url))

  // Zentrale Session löschen
  res.cookies.delete("trainer_session")

  return res
}
