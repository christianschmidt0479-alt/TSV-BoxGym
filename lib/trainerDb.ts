import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { hashAuthSecret } from "@/lib/authSecret"
import { type TrainerLicense } from "@/lib/trainerLicense"

export type { TrainerLicense } from "@/lib/trainerLicense"

const supabase = createServerSupabaseServiceClient()

export type TrainerAccountRecord = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  trainer_birthdate?: string | null
  dosb_license?: string | null
  trainer_license?: TrainerLicense | string | null
  trainer_license_renewals?: string[] | null
  role?: "trainer" | "admin" | null
  linked_member_id?: string | null
  email_verified: boolean
  email_verified_at?: string | null
  is_approved: boolean
  approved_at?: string | null
  password_hash: string
  email_verification_token?: string | null
  created_at?: string | null
  lizenzart?: string | null
  lizenznummer?: string | null
  lizenz_gueltig_bis?: string | null
  lizenz_verband?: string | null
  bemerkung?: string | null
}

type CreateTrainerAccountInput = {
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  trainer_birthdate?: string | null
  dosb_license?: string | null
  trainer_license?: TrainerLicense | null
  bemerkung?: string | null
  pin: string
  email_verification_token?: string | null
  linked_member_id?: string | null
  role?: "trainer" | "admin"
}

function normalizeEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase()
}

function normalizeTrainer(row: Record<string, unknown> | null | undefined): TrainerAccountRecord | null {
  if (!row) return null

  return {
    id: typeof row.id === "string" ? row.id : "",
    first_name: typeof row.first_name === "string" ? row.first_name : "",
    last_name: typeof row.last_name === "string" ? row.last_name : "",
    email: normalizeEmail(typeof row.email === "string" ? row.email : ""),
    phone: typeof row.phone === "string" ? row.phone : null,
    trainer_birthdate: typeof row.trainer_birthdate === "string" ? row.trainer_birthdate : null,
    dosb_license: typeof row.dosb_license === "string" ? row.dosb_license : null,
    trainer_license: typeof row.trainer_license === "string" ? row.trainer_license : null,
    trainer_license_renewals: Array.isArray(row.trainer_license_renewals)
      ? row.trainer_license_renewals.filter((value): value is string => typeof value === "string")
      : null,
    role: row.role === "admin" ? "admin" : row.role === "trainer" ? "trainer" : null,
    linked_member_id: typeof row.linked_member_id === "string" ? row.linked_member_id : null,
    email_verified: Boolean(row.email_verified),
    email_verified_at: typeof row.email_verified_at === "string" ? row.email_verified_at : null,
    is_approved: Boolean(row.is_approved),
    approved_at: typeof row.approved_at === "string" ? row.approved_at : null,
    password_hash: typeof row.password_hash === "string" ? row.password_hash : "",
    email_verification_token: typeof row.email_verification_token === "string" ? row.email_verification_token : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    lizenzart: typeof row.lizenzart === "string" ? row.lizenzart : null,
    lizenznummer: typeof row.lizenznummer === "string" ? row.lizenznummer : null,
    lizenz_gueltig_bis: typeof row.lizenz_gueltig_bis === "string" ? row.lizenz_gueltig_bis : null,
    lizenz_verband: typeof row.lizenz_verband === "string" ? row.lizenz_verband : null,
    bemerkung: typeof row.bemerkung === "string" ? row.bemerkung : null,
  }
}

function isMissingColumnError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")
  )
}

function isUniqueConstraintError(error: { code?: string; message?: string; details?: string | null } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return error?.code === "23505" || message.includes("duplicate key") || message.includes("already exists")
}

export function isTrainerAccountEmailConflict(error: unknown): error is Error {
  if (!error || typeof error !== "object") return false
  const candidate = error as { code?: string; message?: string; details?: string | null }
  return isUniqueConstraintError(candidate)
}

export async function findTrainerByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  const { data, error } = await supabase
    .from("trainer_accounts")
    .select("*")
    .eq("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error
  return normalizeTrainer((data?.[0] as Record<string, unknown> | undefined) ?? null)
}

export async function updateTrainerAccountPin(trainerId: string, pin: string) {
  const password_hash = await hashAuthSecret(pin)
  const { error } = await supabase
    .from("trainer_accounts")
    .update({
      password_hash,
      email_verification_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", trainerId)

  if (error) throw error
}

export async function createTrainerAccount(input: CreateTrainerAccountInput) {
  const password_hash = await hashAuthSecret(input.pin)
  const payload: Record<string, unknown> = {
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    email: normalizeEmail(input.email),
    phone: input.phone?.trim() || null,
    trainer_birthdate: input.trainer_birthdate ?? null,
    dosb_license: input.dosb_license?.trim() || null,
    trainer_license: input.trainer_license ?? null,
    bemerkung: input.bemerkung?.trim() || null,
    password_hash,
    email_verification_token: input.email_verification_token ?? null,
    linked_member_id: input.linked_member_id ?? null,
    role: input.role ?? "trainer",
    email_verified: false,
    is_approved: false,
  }

  const optionalColumns = ["phone", "trainer_birthdate", "dosb_license", "trainer_license", "linked_member_id", "role", "bemerkung"] as const
  const selectedOptional = [...optionalColumns] as string[]
  let attemptPayload = { ...payload }

  while (true) {
    const response = await supabase
      .from("trainer_accounts")
      .insert(attemptPayload)
      .select(["*"].join(", "))
      .single()

    if (!response.error) {
      const trainer = normalizeTrainer((response.data as unknown as Record<string, unknown> | null) ?? null)
      if (!trainer) {
        throw new Error("Trainerkonto konnte nicht geladen werden.")
      }
      return trainer
    }

    if (isUniqueConstraintError(response.error)) {
      const conflict = new Error("Diese E-Mail-Adresse ist bereits vergeben.")
      ;(conflict as Error & { cause?: unknown }).cause = response.error
      throw conflict
    }

    if (!isMissingColumnError(response.error)) {
      throw response.error
    }

    const nextColumn = selectedOptional.find((column) => (response.error?.message ?? "").toLowerCase().includes(column))
    if (!nextColumn) {
      throw response.error
    }

    delete attemptPayload[nextColumn]
    selectedOptional.splice(selectedOptional.indexOf(nextColumn), 1)
  }
}

export async function verifyTrainerEmail(token: string) {
  const normalizedToken = token.trim()
  if (!normalizedToken) return null

  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      email_verification_token: null,
    })
    .eq("email_verification_token", normalizedToken)
    .select("*")
    .maybeSingle()

  if (error) throw error
  return normalizeTrainer((data as Record<string, unknown> | null) ?? null)
}

export async function verifyTrainerEmailAndSetPassword(token: string, pin: string) {
  const normalizedToken = token.trim()
  if (!normalizedToken) return null

  const password_hash = await hashAuthSecret(pin)
  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({
      password_hash,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      email_verification_token: null,
    })
    .eq("email_verification_token", normalizedToken)
    .select("*")
    .maybeSingle()

  if (error) throw error
  return normalizeTrainer((data as Record<string, unknown> | null) ?? null)
}

export async function getAllTrainerAccounts() {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => normalizeTrainer(row))
    .filter((row): row is TrainerAccountRecord => row !== null)
}
