import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getTrainerProfile, upsertTrainerProfile } from "@/lib/trainingTrainerProfileDb"

const TEXT_MAX = 500

type ProfileBody = {
  style?: unknown
  strengths?: unknown
  focus?: unknown
  notes?: unknown
}

function safeText(val: unknown): string | null {
  if (typeof val === "string") return val.trim().slice(0, TEXT_MAX) || null
  return null
}

// ─── GET /api/admin/trainer-profiles/[trainerId] ──────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ trainerId: string }> },
) {
  try {
    if (!isAllowedOrigin(request)) return new NextResponse("Forbidden", { status: 403 })

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const { trainerId } = await params
    if (!trainerId?.trim()) return new NextResponse("Fehlende Trainer-ID", { status: 400 })

    const profile = await getTrainerProfile(trainerId.trim())
    return NextResponse.json({ profile })
  } catch {
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}

// ─── PATCH /api/admin/trainer-profiles/[trainerId] ────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ trainerId: string }> },
) {
  try {
    if (!isAllowedOrigin(request)) return new NextResponse("Forbidden", { status: 403 })

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || session.accountRole !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(
      `admin-trainer-profile:${getRequestIp(request)}`,
      30,
      10 * 60 * 1000,
    )
    if (!rateLimit.ok) return new NextResponse("Too many requests", { status: 429 })

    const { trainerId } = await params
    if (!trainerId?.trim()) return new NextResponse("Fehlende Trainer-ID", { status: 400 })

    const body = (await request.json()) as ProfileBody

    const profile = await upsertTrainerProfile(trainerId.trim(), {
      style: safeText(body.style),
      strengths: safeText(body.strengths),
      focus: safeText(body.focus),
      notes: safeText(body.notes),
    })

    return NextResponse.json({ profile })
  } catch {
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
