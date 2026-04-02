import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { readCheckinSettings } from "@/lib/checkinSettingsDb"

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const settings = await readCheckinSettings()
    return NextResponse.json(settings)
  } catch (error) {
    console.error("public checkin settings failed", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
