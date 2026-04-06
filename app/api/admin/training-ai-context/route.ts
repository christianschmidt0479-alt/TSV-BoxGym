import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getTrainingAiContext, upsertTrainingAiContext } from "@/lib/trainingAiContextDb"

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const context = await getTrainingAiContext()
    return NextResponse.json({ context })
  } catch (error) {
    console.error("[training-ai-context GET]", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

type PutBody = {
  has_ring?: unknown
  ring_often_available?: unknown
  heavy_bags_count?: unknown
  mitts_pairs_count?: unknown
  jump_ropes_count?: unknown
  medicine_balls_count?: unknown
  max_group_size?: unknown
  space_description?: unknown
  training_principles?: unknown
  group_characteristics?: unknown
}

export async function PUT(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-training-ai-context:${getRequestIp(request)}`,
      20,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const body = (await request.json()) as PutBody

    const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
      const n = typeof v === "number" ? v : Number(v)
      if (!Number.isFinite(n)) return fallback
      return Math.min(max, Math.max(min, Math.round(n)))
    }

    const updated = await upsertTrainingAiContext({
      has_ring: body.has_ring === true || body.has_ring === "true",
      ring_often_available: body.ring_often_available === true || body.ring_often_available === "true",
      heavy_bags_count: clamp(body.heavy_bags_count, 0, 50, 8),
      mitts_pairs_count: clamp(body.mitts_pairs_count, 0, 50, 6),
      jump_ropes_count: clamp(body.jump_ropes_count, 0, 100, 12),
      medicine_balls_count: clamp(body.medicine_balls_count, 0, 30, 4),
      max_group_size: clamp(body.max_group_size, 1, 100, 20),
      space_description:
        typeof body.space_description === "string" ? body.space_description.trim().slice(0, 1000) : "",
      training_principles:
        typeof body.training_principles === "string" ? body.training_principles.trim().slice(0, 2000) : "",
      group_characteristics:
        typeof body.group_characteristics === "string" ? body.group_characteristics.trim().slice(0, 2000) : "",
    })

    return NextResponse.json({ context: updated })
  } catch (error) {
    console.error("[training-ai-context PUT]", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
