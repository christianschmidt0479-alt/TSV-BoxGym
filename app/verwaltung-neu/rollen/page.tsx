import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import RollenPageClient from "./RollenPageClient"

export type PersonEntry = {
  memberId: string | null
  trainerId: string | null
  displayName: string
  email: string
  trainerBirthdate: string | null
  dosbLicense: string | null
  isMember: boolean
  isTrial: boolean
  isActiveTrainer: boolean
  hasTrainerAccount: boolean
  isAdmin: boolean
  trainerApproved: boolean
  trainerEmailVerified: boolean
  isLinked: boolean
}

type TrainerRoleRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  role: "trainer" | "admin" | null
  is_approved: boolean | null
  email_verified: boolean | null
  linked_member_id: string | null
  trainer_birthdate?: string | null
  dosb_license?: string | null
}

const TRAINER_BASE_SELECT = "id, first_name, last_name, email, role, is_approved, email_verified, linked_member_id"
const TRAINER_OPTIONAL_SELECT = ["trainer_birthdate", "dosb_license"] as const

function isMissingColumnError(message: string) {
  return message.includes("does not exist") || message.includes("could not find") || message.includes("schema cache")
}

async function loadTrainerRowsWithOptionalColumns(
  supabase: ReturnType<typeof createServerSupabaseServiceClient>
): Promise<TrainerRoleRow[]> {
  const optionalColumns = [...TRAINER_OPTIONAL_SELECT] as string[]

  while (true) {
    const select = [TRAINER_BASE_SELECT, ...optionalColumns].join(", ")
    const response = await supabase
      .from("trainer_accounts")
      .select(select)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })

    if (!response.error) {
      return Array.isArray(response.data) ? (response.data as unknown as TrainerRoleRow[]) : []
    }

    const message = (response.error.message ?? "").toLowerCase()
    const missingColumn = optionalColumns.find((column) => message.includes(column))
    if (!missingColumn || !isMissingColumnError(message)) {
      throw response.error
    }

    optionalColumns.splice(optionalColumns.indexOf(missingColumn), 1)
  }
}

export default async function RollenPage() {
  const supabase = createServerSupabaseServiceClient()

  const [membersResult, trainerList] = await Promise.all([
    supabase
      .from("members")
      .select("id, first_name, last_name, name, email, member_phase, is_approved, is_trial")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    loadTrainerRowsWithOptionalColumns(supabase),
  ])

  const memberList = Array.isArray(membersResult.data) ? membersResult.data : []

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
      trainerBirthdate: (trainer?.trainer_birthdate as string | null | undefined) ?? null,
      dosbLicense: (trainer?.dosb_license as string | null | undefined) ?? null,
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
      trainerBirthdate: (t.trainer_birthdate as string | null | undefined) ?? null,
      dosbLicense: (t.dosb_license as string | null | undefined) ?? null,
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
