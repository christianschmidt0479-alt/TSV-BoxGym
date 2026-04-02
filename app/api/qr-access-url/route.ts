import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createQrAccessToken, QR_ACCESS_PARAM } from "@/lib/qrAccess"

export async function GET(request: Request) {
  if (!isAllowedOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const session = await readTrainerSessionFromHeaders(request)
  if (!session) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const url = new URL(request.url)
  const panel = url.searchParams.get("panel") === "trial" ? "trial" : "member"
  const origin = new URL(request.url).origin
  const token = await createQrAccessToken(panel)
  const path = panel === "trial" ? "/checkin/probetraining" : "/checkin/mitglied"

  return NextResponse.json({
    ok: true,
    url: `${origin.replace(/\/+$/, "")}${path}?${QR_ACCESS_PARAM}=${encodeURIComponent(token)}`,
  })
}
