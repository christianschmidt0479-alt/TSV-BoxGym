import { supabase } from "./supabaseClient"
import { trainerLicenseOptions, type TrainerLicense } from "./trainerLicense"
import { hashTrainerPin } from "./trainerPin"
import { isInternalTrainerTestEmail } from "./trainerAdmin"
export { trainerLicenseOptions }
export type { TrainerLicense }

type SupabaseErrorLike = {
  code?: string
  message?: string
  details?: string | null
}

const OPTIONAL_TRAINER_ACCOUNT_COLUMNS = [
  "linked_member_id",
  "phone",
  "trainer_license",
  "role",
  "trainer_license_renewals",
  "lizenzart",
  "lizenznummer",
  "lizenz_gueltig_bis",
  "lizenz_verband",
  "bemerkung",
] as const
const TRAINER_ACCOUNT_SAFE_SELECT =
  "id, first_name, last_name, email, phone, trainer_license, trainer_license_renewals, lizenzart, lizenznummer, lizenz_gueltig_bis, lizenz_verband, bemerkung, email_verified, email_verified_at, is_approved, approved_at, role, linked_member_id, created_at"

export class TrainerAccountEmailConflictError extends Error {
  constructor(public email: string) {
    super("Diese E-Mail-Adresse ist bereits vergeben.")
    this.name = "TrainerAccountEmailConflictError"
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

function isUniqueConstraintError(error: SupabaseErrorLike | null) {
  const message = error?.message?.toLowerCase() ?? ""
  const details = error?.details?.toLowerCase() ?? ""
  return error?.code === "23505" || message.includes("duplicate key") || details.includes("already exists")
}

function isTrainerEmailConflictError(error: SupabaseErrorLike | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  return isUniqueConstraintError(error) && (message.includes("email") || message.includes("trainer_accounts_email"))
}

function findMissingOptionalColumn(error: SupabaseErrorLike | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return OPTIONAL_TRAINER_ACCOUNT_COLUMNS.find((column) => message.includes(column)) ?? null
}

export type TrainerAccountRecord = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  trainer_license?: TrainerLicense | null
  trainer_license_renewals?: string[] | null
  lizenzart?: string | null
  lizenznummer?: string | null
  lizenz_gueltig_bis?: string | null
  lizenz_verband?: string | null
  bemerkung?: string | null
  password_hash: string
  email_verified: boolean
  email_verified_at: string | null
  email_verification_token: string | null
  is_approved: boolean
  approved_at: string | null
  role?: "trainer" | "admin"
  linked_member_id?: string | null
  created_at: string
}

type TrainerAccountInput = {
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  trainer_license?: TrainerLicense | null
  pin: string
  email_verification_token: string
  linked_member_id?: string | null
}

export function isTrainerAccountEmailConflict(value: unknown): value is TrainerAccountEmailConflictError {
  return value instanceof TrainerAccountEmailConflictError
}

export async function findTrainerByEmail(email: string) {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as TrainerAccountRecord | null) ?? null
}

export async function createTrainerAccount(input: TrainerAccountInput) {
  let passwordHash = ""
  try {
    passwordHash = await hashTrainerPin(input.pin)
  } catch (error) {
    console.error("[trainerDb.createTrainerAccount] pin hash failed", { email: input.email.trim().toLowerCase() }, error)
    throw error
  }

  const payload = {
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    trainer_license: input.trainer_license ?? "Keine DOSB-Lizenz",
    password_hash: passwordHash,
    email_verified: false,
    email_verified_at: null,
    email_verification_token: input.email_verification_token,
    is_approved: false,
    approved_at: null,
    role: "trainer",
    linked_member_id: input.linked_member_id ?? null,
  }

  const attemptPayload: Record<string, unknown> = { ...payload }
  let removedOptionalColumns = 0

  while (true) {
    const result = await supabase
      .from("trainer_accounts")
      .insert([attemptPayload])
      .select("*")
      .single()

    if (!result.error) {
      return result.data as TrainerAccountRecord
    }

    if (isTrainerEmailConflictError(result.error)) {
      console.warn("[trainerDb.createTrainerAccount] duplicate email", { email: payload.email })
      throw new TrainerAccountEmailConflictError(payload.email)
    }

    if (!isMissingColumnError(result.error) || removedOptionalColumns >= OPTIONAL_TRAINER_ACCOUNT_COLUMNS.length) {
      console.error(
        "[trainerDb.createTrainerAccount] db insert failed",
        { email: payload.email, attemptedColumns: Object.keys(attemptPayload) },
        result.error
      )
      throw result.error
    }

    const missingColumn =
      findMissingOptionalColumn(result.error) ??
      OPTIONAL_TRAINER_ACCOUNT_COLUMNS.find((column) => column in attemptPayload) ??
      null

    if (!missingColumn) {
      console.error(
        "[trainerDb.createTrainerAccount] missing column fallback exhausted",
        { email: payload.email, attemptedColumns: Object.keys(attemptPayload) },
        result.error
      )
      throw result.error
    }

    console.warn("[trainerDb.createTrainerAccount] optional column missing during insert", {
      email: payload.email,
      column: missingColumn,
      step: missingColumn === "role" ? "role assignment" : "db insert",
    })
    delete attemptPayload[missingColumn]
    removedOptionalColumns += 1
  }
}

export async function verifyTrainerEmail(token: string) {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      email_verification_token: null,
    })
    .eq("email_verification_token", token)
    .select("*")
    .maybeSingle()

  if (error) throw error
  return (data as TrainerAccountRecord | null) ?? null
}

export async function getAllTrainerAccounts() {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .select(TRAINER_ACCOUNT_SAFE_SELECT)
    .order("created_at", { ascending: false })

  if (error) throw error
  const rows = (data as TrainerAccountRecord[] | null) ?? []
  return rows.filter((r) => !isInternalTrainerTestEmail(r.email))
}

export async function approveTrainerAccount(id: string) {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({
      is_approved: true,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(TRAINER_ACCOUNT_SAFE_SELECT)
    .single()

  if (error) throw error
  return data as TrainerAccountRecord
}

export async function updateTrainerAccountRole(id: string, role: "trainer" | "admin") {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({ role })
    .eq("id", id)
    .select(TRAINER_ACCOUNT_SAFE_SELECT)
    .single()

  if (error) throw error
  return data as TrainerAccountRecord
}

export async function linkTrainerAccountToMember(id: string, memberId: string | null) {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({ linked_member_id: memberId })
    .eq("id", id)
    .select(TRAINER_ACCOUNT_SAFE_SELECT)
    .single()

  if (error) throw error
  return data as TrainerAccountRecord
}

export async function updateTrainerAccountPin(id: string, pin: string) {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({ password_hash: await hashTrainerPin(pin) })
    .eq("id", id)
    .select(TRAINER_ACCOUNT_SAFE_SELECT)
    .single()

  if (error) throw error
  return data as TrainerAccountRecord
}
