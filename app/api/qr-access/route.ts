import { NextResponse } from "next/server"
import { QR_ACCESS_MINUTES, QR_ACCESS_PARAM } from "@/lib/qrAccess"
import { getQrAccessToken } from "@/lib/qrAccessServer"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get(QR_ACCESS_PARAM)?.trim() ?? ""

  if (!token) {
    return new NextResponse("Missing token", { status: 400 })
  }

  if (token !== getQrAccessToken()) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  return NextResponse.json({
    ok: true,
    accessUntil: Date.now() + QR_ACCESS_MINUTES * 60 * 1000,
  })
}
