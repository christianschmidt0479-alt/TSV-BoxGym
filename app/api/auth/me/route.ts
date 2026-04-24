import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET() {
  const cookieStore = await cookies()

  const trainerSession = cookieStore.get("trainer_session")
  const memberSession = cookieStore.get("tsv_member_area_session")

  if (trainerSession?.value) {
    try {
      const data = JSON.parse(trainerSession.value)
      return NextResponse.json({ role: data.role })
    } catch {}
  }

  if (memberSession) {
    return NextResponse.json({ role: "member" })
  }

  return NextResponse.json({ role: "guest" })
}
