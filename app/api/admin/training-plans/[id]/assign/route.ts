import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { assignTrainerToPlan } from "@/lib/trainingPlansDb"

type AssignBody = {
  trainer_id?: unknown
}

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
      `admin-training-plans-assign:${getRequestIp(request)}`,
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

    const body = (await request.json()) as AssignBody

    // trainer_id kann null sein (Zuweisung entfernen) oder ein UUID-String
    const trainerId =
      body.trainer_id === null
        ? null
        : typeof body.trainer_id === "string" && body.trainer_id.trim()
          ? body.trainer_id.trim()
          : undefined

    if (trainerId === undefined) {
      return new NextResponse("trainer_id muss ein UUID-String oder null sein", { status: 400 })
    }

    const plan = await assignTrainerToPlan(id.trim(), trainerId)
    return NextResponse.json({ plan })
  } catch (error) {
    console.error("[admin training-plans assign PATCH]", error)
    return new NextResponse("Interner Fehler", { status: 500 })
  }
}
