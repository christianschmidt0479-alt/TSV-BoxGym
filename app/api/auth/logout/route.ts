import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/mein-bereich", request.url))

  // Mitglieder-Session löschen
  res.cookies.delete("tsv_member_area_session")

  // Trainer/Admin Session löschen
  res.cookies.delete("trainer_session")

  return res
}
