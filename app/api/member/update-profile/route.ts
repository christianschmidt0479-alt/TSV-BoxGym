import { NextResponse } from "next/server"
import { getMemberFromSession } from "@/lib/memberAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type UpdateProfileBody = {
  name?: string
  phone?: string
  birthdate?: string
}

function shortMemberId(memberId: unknown): string {
  const raw = typeof memberId === "string" || typeof memberId === "number" ? String(memberId) : "unknown"
  if (raw.length <= 8) return raw
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`
}

function sanitizeErrorText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  // Avoid logging potentially personal or secret-like values.
  const suspiciousPattern = /(token|hash|pin|password|email|@|member_?qr|verification)/i
  if (suspiciousPattern.test(trimmed)) return undefined

  return trimmed
}

export async function POST(req: Request) {
  const member = await getMemberFromSession()

  if (!member) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as UpdateProfileBody | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const phone = typeof body?.phone === "string" ? body.phone.trim() : ""
  const birthdate = typeof body?.birthdate === "string" ? body.birthdate : ""

  const updateData: any = {}

  if (name) updateData.name = name
  if (phone) updateData.phone = phone
  if (birthdate) updateData.birthdate = birthdate

  const { error } = await supabaseAdmin
    .from("members")
    .update(updateData)
    .eq("id", member.id)
    .select()

  const isDevelopment = process.env.NODE_ENV !== "production"
  const memberIdForLog = shortMemberId(member.id)

  if (isDevelopment && !error) {
    console.log("member-update-profile success", {
      memberId: memberIdForLog,
      updatedFields: Object.keys(updateData),
    })
  }

  if (error) {
    const safeDetails = sanitizeErrorText(error.details)
    const safeHint = sanitizeErrorText(error.hint)

    console.error("member-update-profile failure", {
      memberId: memberIdForLog,
      code: error.code || null,
      message: error.message || "unknown error",
      ...(safeDetails ? { details: safeDetails } : {}),
      ...(safeHint ? { hint: safeHint } : {}),
    })

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
