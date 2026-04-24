import { NextResponse } from "next/server"
import { findMemberById, findTrainerByEmailAndPin } from "@/lib/boxgymDb"
import { TRAINER_SESSION_COOKIE, createTrainerSessionToken } from "@/lib/authSession"

type TrainerLoginBody = {
  email?: string
  password?: string
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TrainerLoginBody
    const email = (body.email ?? "").trim().toLowerCase()
    const password = (body.password ?? "").trim()

    if (process.env.NODE_ENV !== "production") {
      console.log("TRAINER LOGIN ATTEMPT:", email)
    }

    if (!email || !password) {
      return NextResponse.json({ error: "E-Mail und Passwort sind erforderlich" }, { status: 400 })
    }

    const user = await findTrainerByEmailAndPin(email, password)

    if (process.env.NODE_ENV !== "production") {
      console.log("TRAINER FOUND:", user)
    }

    const isValid = Boolean(user)

    if (process.env.NODE_ENV !== "production") {
      console.log("PASSWORD MATCH:", isValid)
    }

    if (!user) {
      return NextResponse.json({ error: "Login fehlgeschlagen" }, { status: 401 })
    }

    const isAdminEmailOverride = ADMIN_EMAILS.includes(user.email.toLowerCase())
    const role = user.role === "admin" || isAdminEmailOverride ? "admin" : "trainer"
    const linkedMemberId = user.linked_member_id ?? null

    const linkedMember = linkedMemberId ? await findMemberById(linkedMemberId) : null
    const memberId = linkedMember?.id ?? null
    const isMember = Boolean(memberId)

    const token = await createTrainerSessionToken({
      role: role === "admin" ? "admin" : "trainer",
      accountRole: role === "admin" ? "admin" : "trainer",
      linkedMemberId,
      memberId,
      isMember,
      accountEmail: user.email,
      accountFirstName: user.first_name,
      accountLastName: user.last_name,
    })

    const res = NextResponse.json({ ok: true, role })

    res.cookies.set(TRAINER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    if (process.env.NODE_ENV !== "production") {
      console.log("SESSION TOKEN CREATED", token.length)
      console.log("SESSION SET")
    }

    return res
  } catch {
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
