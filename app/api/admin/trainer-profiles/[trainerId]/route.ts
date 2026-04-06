import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { getTrainerProfile, upsertTrainerProfile } from "@/lib/trainingTrainerProfileDb"

const TEXT_MAX_SHORT = 500
const TEXT_MAX_LONG = 1000

type ProfileBody = {
  style?: unknown
  strengths?: unknown
  focus?: unknown
  notes?: unknown
  internal_label?: unknown
  trainer_license?: unknown
  trainer_experience_level?: unknown
  trainer_limitations?: unknown
  trainer_group_handling?: unknown
  trainer_pedagogy_notes?: unknown
  preferred_structure_level?: unknown
  admin_internal_notes?: unknown
}

function safeText(val: unknown, max = TEXT_MAX_SHORT): string | null {
  if (typeof val === "string") return val.trim().slice(0, max) || null
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
      notes: safeText(body.notes, TEXT_MAX_LONG),
      internal_label: safeText(body.internal_label),
      trainer_license: safeText(body.trainer_license),
      trainer_experience_level: safeText(body.trainer_experience_level),
      trainer_limitations: safeText(body.trainer_limitations, TEXT_MAX_LONG),
      trainer_group_handling: safeText(body.trainer_group_handling, TEXT_MAX_LONG),
      trainer_pedagogy_notes: safeText(body.trainer_pedagogy_notes, TEXT_MAX_LONG),
      preferred_structure_level: safeText(body.preferred_structure_level),
      admin_internal_notes: safeText(body.admin_internal_notes, TEXT_MAX_LONG),
    })

    return NextResponse.json({ profile })
  } catch {
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
