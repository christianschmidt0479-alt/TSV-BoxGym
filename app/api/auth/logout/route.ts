import { NextResponse } from "next/server"
import { MEMBER_AREA_SESSION_COOKIE } from "@/lib/publicAreaSession"
import { TRAINER_SESSION_COOKIE } from "@/lib/authSession"

export async function POST() {
  const res = NextResponse.json({ ok: true })

  // Zentrale Sessions löschen
  res.cookies.set(TRAINER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  })
  res.cookies.set(MEMBER_AREA_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  })
  res.cookies.set("member_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  })

  return res
}
