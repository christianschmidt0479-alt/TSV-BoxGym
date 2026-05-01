import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyTrainerSessionToken } from "@/lib/authSession"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"

type GetTrainersRequestBody = {
  trainerId?: string
  includeMemberBirthdate?: boolean
}

type TrainerAccountRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  trainer_license?: string | null
  is_approved?: boolean | null
  email_verified?: boolean | null
  linked_member_id?: string | null
}

export async function POST(request: Request) {
  try {
    const session = (await cookies()).get("trainer_session")

    if (!session) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 })
    }

    const valid = await verifyTrainerSessionToken(session.value)

    if (!valid || valid.role !== "admin") {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 })
    }

    let body: GetTrainersRequestBody | null = null
    try {
      body = (await request.json()) as GetTrainersRequestBody
    } catch {
      body = null
    }

    const trainerId = typeof body?.trainerId === "string" && body.trainerId.trim() ? body.trainerId.trim() : null
    const includeMemberBirthdate = body?.includeMemberBirthdate === true

    const supabase = createServerSupabaseServiceClient()

    let data: TrainerAccountRow[] = []
    let error: { message?: string } | null = null

    if (trainerId) {
      const singleResponse = await supabase
        .from("trainer_accounts")
        .select("id, first_name, last_name, email, trainer_license, is_approved, email_verified, linked_member_id")
        .eq("id", trainerId)
        .maybeSingle()

      error = singleResponse.error
      data = singleResponse.data ? [singleResponse.data as TrainerAccountRow] : []
    } else {
      const listResponse = await supabase
        .from("trainer_accounts")
        .select("id, first_name, last_name, email, trainer_license, is_approved, email_verified, linked_member_id")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })

      error = listResponse.error
      data = (listResponse.data ?? []) as TrainerAccountRow[]
    }

    if (error) {
      console.error("SUPABASE ERROR:", error)
      return new Response(JSON.stringify({ error: true }), { status: 500 })
    }

    const memberIds = includeMemberBirthdate
      ? (data ?? []).map((t) => t.linked_member_id).filter(Boolean) as string[]
      : []

    let membersMap: Record<string, { id: string; birthdate: string | null }> = {}

    if (memberIds.length > 0) {
      const { data: members, error: membersError } = await supabase
        .from("members")
        .select("id, birthdate")
        .in("id", memberIds)

      if (membersError) {
        console.error("SUPABASE ERROR:", membersError)
        return new Response(JSON.stringify({ error: true }), { status: 500 })
      }

      if (members) {
        membersMap = Object.fromEntries(members.map((m) => [m.id, m]))
      }
    }

    const enriched = (data ?? []).map((trainer) => ({
      ...trainer,
      birthdate: includeMemberBirthdate && trainer.linked_member_id
        ? (membersMap[trainer.linked_member_id]?.birthdate ?? null)
        : null,
    }))

    return NextResponse.json({ trainers: enriched }, { status: 200 })
  } catch (error) {
    console.error("API ERROR:", error)
    return new Response(JSON.stringify({ error: true, message: "Serverfehler" }), { status: 500 })
  }
}