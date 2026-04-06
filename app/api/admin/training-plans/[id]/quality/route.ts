import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { updateTemplateQuality, type TemplateQuality } from "@/lib/trainingPlansDb"

const ALLOWED_QUALITIES: TemplateQuality[] = ["tested", "recommended", "standard"]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-training-plans-quality:${getRequestIp(request)}`,
      30,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const { id } = await params
    if (!id?.trim()) {
      return new NextResponse("Fehlende Plan-ID", { status: 400 })
    }

    const body = (await request.json()) as { quality?: unknown }
    const quality: TemplateQuality | null =
      ALLOWED_QUALITIES.includes(body.quality as TemplateQuality)
        ? (body.quality as TemplateQuality)
        : null

    const plan = await updateTemplateQuality(id.trim(), quality)
    return NextResponse.json({ plan })
  } catch (error) {
    console.error("admin training-plans quality PATCH failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
