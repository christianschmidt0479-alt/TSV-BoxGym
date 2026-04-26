import { NextResponse } from "next/server"
import { getMemberFromSession } from "@/lib/memberAuth"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

type UpdateProfileBody = {
  name?: string
  phone?: string
  birthdate?: string
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

  const { data, error } = await supabaseAdmin
    .from("members")
    .update(updateData)
    .eq("id", member.id)
    .select()

  console.log("UPDATE DATA:", data)
  console.log("UPDATE ERROR RAW:", error)
  console.log("UPDATE ERROR KEYS:", Object.keys(error || {}))
  console.log("UPDATE ERROR MESSAGE:", error?.message)
  console.log("UPDATE ERROR DETAILS:", error?.details)
  console.log("UPDATE ERROR HINT:", error?.hint)
  console.log("UPDATE ERROR CODE:", error?.code)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
