import { NextResponse } from "next/server"
import { findMemberById } from "@/lib/boxgymDb"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { verifyAuthSecret } from "@/lib/authSecret"
import { TRAINER_SESSION_COOKIE, createTrainerSessionToken } from "@/lib/authSession"

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

type MemberAccountRow = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  password_hash: string | null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TrainerLoginBody
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
      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, email, first_name, last_name, password_hash")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (memberError) {
        throw memberError
      }

      const memberAccount = (member as MemberAccountRow | null) ?? null
      if (!memberAccount?.password_hash) {
        return NextResponse.json(
          {
            ok: false,
            error: "Kein Passwort gesetzt. Bitte Trainer kontaktieren.",
          },
          { status: 400 }
        )
      }

      const passwordMatch = await verifyAuthSecret(inputPassword, memberAccount.password_hash)
      if (!passwordMatch) {
        return NextResponse.json(
          {
            ok: false,
            error: "Falsches Passwort",
          },
          { status: 401 }
        )
      }

      const token = await createTrainerSessionToken({
        userId: memberAccount.id,
        role: null,
        accountRole: null,
        linkedMemberId: null,
        memberId: memberAccount.id,
        isMember: true,
        accountEmail: memberAccount.email ?? email,
        accountFirstName: memberAccount.first_name ?? "",
        accountLastName: memberAccount.last_name ?? "",
      })

      const res = NextResponse.json({ ok: true, role: null, redirectTo: "/mein-bereich" })

      res.cookies.set(TRAINER_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      })

      return res
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

    const res = NextResponse.json({ ok: true, role, redirectTo: "/trainer" })

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
