import { NextResponse } from "next/server"
import { sessions } from "@/lib/boxgymSessions"

function getDayKey(date: Date) {
  const day = date.getDay()

  switch (day) {
    case 1:
      return "Montag"
    case 2:
      return "Dienstag"
    case 3:
      return "Mittwoch"
    case 4:
      return "Donnerstag"
    case 5:
      return "Freitag"
    default:
      return ""
  }
}

export async function GET() {
  try {
    const dayKey = getDayKey(new Date())
    const rows = sessions
      .filter((session) => session.dayKey === dayKey)
      .map((session) => ({
        start: session.start,
        end: session.end,
        group: session.group,
        name: session.group,
      }))

    return NextResponse.json({ data: rows })
  } catch (error) {
    console.error("public sessions today failed", error)
    return NextResponse.json({ data: [] }, { status: 200 })
  }
}
