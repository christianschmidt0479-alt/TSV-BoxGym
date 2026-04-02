import { NextResponse } from "next/server"
import { applyQrAccessCookie, QR_ACCESS_MINUTES, QR_ACCESS_PARAM, verifyQrAccessToken } from "@/lib/qrAccess"
import { getQrAccessToken } from "@/lib/qrAccessServer"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get(QR_ACCESS_PARAM)?.trim() ?? ""
  const panel = url.searchParams.get("panel") === "trial" ? "trial" : "member"

  if (!token) {
    return new NextResponse("Missing token", { status: 400 })
  }

  const signedAccess = await verifyQrAccessToken(token)
  if (signedAccess) {
    if (signedAccess.panel !== panel) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const response = NextResponse.json({
      ok: true,
      panel,
      accessUntil: Date.now() + QR_ACCESS_MINUTES * 60 * 1000,
    })

    return applyQrAccessCookie(response, panel)
  }

  if (token !== getQrAccessToken()) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const response = NextResponse.json({
    ok: true,
    panel,
    accessUntil: Date.now() + QR_ACCESS_MINUTES * 60 * 1000,
  })

  return applyQrAccessCookie(response, panel)
}
