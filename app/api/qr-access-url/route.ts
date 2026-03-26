import { NextResponse } from "next/server"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { buildQrAccessUrl } from "@/lib/qrAccessServer"

export async function GET(request: Request) {
  const session = await readTrainerSessionFromHeaders(request)
  if (!session) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const url = new URL(request.url)
  const panel = url.searchParams.get("panel") === "trial" ? "trial" : "member"
  const origin = new URL(request.url).origin

  return NextResponse.json({
    ok: true,
    url: buildQrAccessUrl(origin, panel),
  })
}
