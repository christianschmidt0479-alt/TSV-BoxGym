import { NextResponse } from "next/server"
import { checkRateLimitAsync, getRequestIp, isAllowedOrigin } from "@/lib/apiSecurity"
import { readTrainerSessionFromHeaders } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { needsWeight } from "@/lib/memberUtils"
import { analyzeWeightProgress } from "@/lib/weightAnalysis"
import { getBoxingAgeClass } from "@/lib/boxingAgeClass"
import { getBoxingWeightClass } from "@/lib/boxingWeightClass"

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

const TRAINER_COMPETITION_MEMBER_SELECT =
  "id, name, first_name, last_name, base_group, birthdate, gender, is_competition_member, is_wettkaempfer, competition_target_weight"

type CompetitionMemberRow = {
  id: string
  name: string | null
  first_name: string | null
  last_name: string | null
  base_group: string | null
  birthdate: string | null
  gender: string | null
  is_competition_member: boolean | null
  is_wettkaempfer: boolean | null
  competition_target_weight: number | null
}

type WeightLogRow = {
  member_id: string | null
  created_at: string
  weight_kg: number
  source: string
  note: string | null
}

type CheckinWeightRow = {
  member_id: string | null
  created_at: string
  weight: number | null
}

type ApiWeightEntry = {
  created_at: string
  weight_kg: number
  source: string
  note: string | null
}

function displayName(member: CompetitionMemberRow) {
  const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return fullName || member.name || "Unbekannt"
}

function groupWeightLogs(rows: WeightLogRow[]) {
  const map = new Map<string, ApiWeightEntry[]>()

  for (const row of rows) {
    if (!row.member_id) continue

    const entry: ApiWeightEntry = {
      created_at: row.created_at,
      weight_kg: Number(row.weight_kg),
      source: row.source || "manual",
      note: row.note ?? null,
    }

    const existing = map.get(row.member_id) ?? []
    if (existing.length < 10) {
      existing.push(entry)
      map.set(row.member_id, existing)
    }
  }

  return map
}

function groupCheckinWeights(rows: CheckinWeightRow[]) {
  const map = new Map<string, ApiWeightEntry[]>()

  for (const row of rows) {
    if (!row.member_id || row.weight === null) continue

    const entry: ApiWeightEntry = {
      created_at: row.created_at,
      weight_kg: Number(row.weight),
      source: "checkin",
      note: null,
    }

    const existing = map.get(row.member_id) ?? []
    if (existing.length < 10) {
      existing.push(entry)
      map.set(row.member_id, existing)
    }
  }

  return map
}

export async function GET(request: Request) {
  try {
    if (!isAllowedOrigin(request)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const session = await readTrainerSessionFromHeaders(request)
    if (!session || (session.accountRole !== "trainer" && session.accountRole !== "admin")) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const rateLimit = await checkRateLimitAsync(`trainer-competition:${getRequestIp(request)}`, 60, 10 * 60 * 1000)
    if (!rateLimit.ok) {
      return new NextResponse("Too many requests", { status: 429 })
    }

    const supabase = getServerSupabase()
    const membersResponse = await supabase
      .from("members")
      .select(TRAINER_COMPETITION_MEMBER_SELECT)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })

    if (membersResponse.error) throw membersResponse.error

    const allMembers = (membersResponse.data ?? []) as CompetitionMemberRow[]
    const relevantMembers = allMembers.filter((member) => needsWeight(member))
    const memberIds = relevantMembers.map((member) => member.id)

    if (memberIds.length === 0) {
      return NextResponse.json({ members: [], viewerRole: session.accountRole })
    }

    let weightMap = new Map<string, ApiWeightEntry[]>()
    let needsCheckinFallbackIds = [...memberIds]

    try {
      const logsResponse = await supabase
        .from("member_weight_logs")
        .select("member_id, created_at, weight_kg, source, note")
        .in("member_id", memberIds)
        .order("created_at", { ascending: false })

      if (!logsResponse.error) {
        const logRows = (logsResponse.data ?? []) as WeightLogRow[]
        weightMap = groupWeightLogs(logRows)
        needsCheckinFallbackIds = memberIds.filter((memberId) => (weightMap.get(memberId)?.length ?? 0) === 0)
      }
    } catch {
      needsCheckinFallbackIds = [...memberIds]
    }

    if (needsCheckinFallbackIds.length > 0) {
      const checkinsResponse = await supabase
        .from("checkins")
        .select("member_id, created_at, weight")
        .in("member_id", needsCheckinFallbackIds)
        .not("weight", "is", null)
        .order("created_at", { ascending: false })

      if (checkinsResponse.error) throw checkinsResponse.error

      const fallbackMap = groupCheckinWeights((checkinsResponse.data ?? []) as CheckinWeightRow[])
      for (const memberId of needsCheckinFallbackIds) {
        if ((weightMap.get(memberId)?.length ?? 0) > 0) continue
        weightMap.set(memberId, fallbackMap.get(memberId) ?? [])
      }
    }

    const members = relevantMembers.map((member) => {
      const logs = weightMap.get(member.id) ?? []
      const targetWeightKg = typeof member.competition_target_weight === "number" ? member.competition_target_weight : null
      const analysis = analyzeWeightProgress({
        targetWeightKg,
        logs,
      })
      const ageClass = getBoxingAgeClass(member.birthdate ?? null)
      const weightClass = getBoxingWeightClass({
        weightKg: logs[0]?.weight_kg ?? null,
        ageClass: ageClass.ageClass,
        gender: member.gender ?? null,
      })

      return {
        id: member.id,
        name: displayName(member),
        group: member.base_group,
        targetWeightKg,
        lastWeightKg: logs[0]?.weight_kg ?? null,
        distanceKg: analysis.distanceKg,
        status: analysis.status,
        trend: analysis.trend,
        message: analysis.message,
        lastChangeKg: analysis.lastChangeKg,
        weightClass,
        logs,
      }
    })

    return NextResponse.json({ members, viewerRole: session.accountRole })
  } catch (error) {
    console.error("trainer competition failed", error)
    return new NextResponse("Internal server error", { status: 500 })
  }
}
