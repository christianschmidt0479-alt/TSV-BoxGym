import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { verifyTrainerSessionToken } from "@/lib/authSession"

export async function GET() {
  const cookieStore = await cookies()

  const trainerSession = cookieStore.get("trainer_session")?.value

  if (trainerSession) {
    const data = await verifyTrainerSessionToken(trainerSession)
    if (data?.role) {
      return NextResponse.json({ role: data.role })
    }
  }

  return NextResponse.json({ role: "guest" })
}
