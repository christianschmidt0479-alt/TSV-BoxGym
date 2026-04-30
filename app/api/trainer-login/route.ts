import { NextResponse } from "next/server"
import { findMemberById } from "@/lib/boxgymDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { verifyAuthSecret } from "@/lib/authSecret"
import { TRAINER_SESSION_COOKIE, createTrainerSessionToken } from "@/lib/authSession"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { clearMemberAreaSessionCookie } from "@/lib/publicAreaSession"
import { ratelimit } from "@/lib/ratelimit"

type TrainerLoginBody = {
  email?: string
  password?: string
}

type TrainerAccountRow = {
  id: string
  email: string
  first_name: string
  last_name: string
  role: "trainer" | "admin" | null
  password_hash: string
  email_verified: boolean | null
  is_approved: boolean | null
  linked_member_id: string | null
}

export async function POST(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"
    const { success } = await ratelimit.limit(`trainer-login:${ip}`)
    if (!success) {
      return NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429 })
    }

    let rawBody: unknown = {}
    try {
      rawBody = await request.json()
    } catch {
      rawBody = {}
    }

    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const body = rawBody as TrainerLoginBody
    const email = (body.email ?? "").trim().toLowerCase()
    const inputPassword = (body.password ?? "").trim()

    if (!email || !inputPassword) {
      return NextResponse.json({ error: "E-Mail und Passwort sind erforderlich" }, { status: 400 })
    }

    const supabase = createServerSupabaseServiceClient()
    const { data: trainer, error: trainerError } = await supabase
      .from("trainer_accounts")
      .select("id, email, first_name, last_name, role, password_hash, email_verified, is_approved, linked_member_id")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (trainerError) {
      throw trainerError
    }

    const account = (trainer as TrainerAccountRow | null) ?? null

    if (!account) {
      return NextResponse.json({ error: "Login fehlgeschlagen" }, { status: 401 })
    }

    if (!account.email_verified || !account.is_approved) {
      return NextResponse.json({ error: "Login fehlgeschlagen" }, { status: 401 })
    }

    const isValid = await verifyAuthSecret(inputPassword, account.password_hash)

    if (!isValid) {
      return NextResponse.json({ error: "Login fehlgeschlagen" }, { status: 401 })
    }

    const role = account.role === "admin" ? "admin" : "trainer"
    const linkedMemberId = account.linked_member_id ?? null

    const linkedMember = linkedMemberId ? await findMemberById(linkedMemberId) : null
    const memberId = linkedMember?.id ?? null

    const token = await createTrainerSessionToken({
      userId: account.id,
      role: role === "admin" ? "admin" : "trainer",
      accountRole: role === "admin" ? "admin" : "trainer",
      linkedMemberId,
      memberId,
      isMember: Boolean(memberId),
      accountEmail: account.email,
      accountFirstName: account.first_name,
      accountLastName: account.last_name,
    })

    const redirectTo = role === "admin" ? "/verwaltung-neu" : "/trainer"
    const res = NextResponse.json({ ok: true, role, redirectTo })
    clearMemberAreaSessionCookie(res)

    res.cookies.set(TRAINER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    return res
  } catch {
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 })
  }
}
