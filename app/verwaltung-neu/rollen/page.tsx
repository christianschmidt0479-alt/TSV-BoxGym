import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import RollenPageClient from "./RollenPageClient"

export type PersonEntry = {
  memberId: string | null
  trainerId: string | null
  displayName: string
  email: string
  isMember: boolean
  isTrial: boolean
  isActiveTrainer: boolean
  hasTrainerAccount: boolean
  isAdmin: boolean
  trainerApproved: boolean
  trainerEmailVerified: boolean
  isLinked: boolean
}

export default async function RollenPage() {
  const supabase = createServerSupabaseServiceClient()

  const [membersResult, trainersResult] = await Promise.all([
    supabase
      .from("members")
      .select("id, first_name, last_name, name, email, member_phase, is_approved, is_trial")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase
      .from("trainer_accounts")
      .select("id, first_name, last_name, email, role, is_approved, email_verified, linked_member_id")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
  ])

  const memberList = Array.isArray(membersResult.data) ? membersResult.data : []
  const trainerList = Array.isArray(trainersResult.data) ? trainersResult.data : []

  // Build lookup maps
  const trainerByMemberId = new Map<string, (typeof trainerList)[number]>()
  const trainerByEmail = new Map<string, (typeof trainerList)[number]>()
  for (const t of trainerList) {
    if (t.linked_member_id) trainerByMemberId.set(t.linked_member_id, t)
    if (t.email) trainerByEmail.set(t.email.toLowerCase(), t)
  }

  const entries: PersonEntry[] = []
  const usedTrainerIds = new Set<string>()

  // Members (with optional linked trainer account)
  for (const m of memberList) {
    const trainer =
      trainerByMemberId.get(m.id) ??
      (m.email ? trainerByEmail.get(m.email.toLowerCase()) : undefined) ??
      null

    if (trainer) usedTrainerIds.add(trainer.id)

    const displayName =
      [m.first_name?.trim(), m.last_name?.trim()].filter(Boolean).join(" ") ||
      m.name?.trim() ||
      "(unbekannt)"

    entries.push({
      memberId: m.id,
      trainerId: trainer?.id ?? null,
      displayName,
      email: m.email ?? "",
      isMember: true,
      isTrial: Boolean(m.is_trial),
      isActiveTrainer: Boolean(trainer?.is_approved),
      hasTrainerAccount: Boolean(trainer),
      isAdmin: trainer?.role === "admin",
      trainerApproved: Boolean(trainer?.is_approved),
      trainerEmailVerified: Boolean(trainer?.email_verified),
      isLinked: Boolean(trainer?.linked_member_id === m.id),
    })
  }

  // Standalone trainer accounts (no linked member)
  for (const t of trainerList) {
    if (usedTrainerIds.has(t.id)) continue

    const displayName =
      [t.first_name?.trim(), t.last_name?.trim()].filter(Boolean).join(" ") || "(unbekannt)"

    entries.push({
      memberId: null,
      trainerId: t.id,
      displayName,
      email: t.email ?? "",
      isMember: false,
      isTrial: false,
      isActiveTrainer: Boolean(t.is_approved),
      hasTrainerAccount: true,
      isAdmin: t.role === "admin",
      trainerApproved: Boolean(t.is_approved),
      trainerEmailVerified: Boolean(t.email_verified),
      isLinked: false,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Rollen &amp; Rechte</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Hier verwaltet der Admin Trainer-, Sportler- und Adminrollen. Mitgliedsdaten und Check-ins bleiben unverändert.
        </p>
      </div>
      <RollenPageClient entries={entries} />
    </div>
  )
}
