import { supabase } from "./supabaseClient"
import { hashTrainerPin } from "./trainerPin"

export const trainerLicenseOptions = [
  "Keine DOSB-Lizenz",
  "Übungsleiter DOSB C",
  "Trainer DOSB Boxen C",
  "Trainer DOSB Boxen B",
  "Trainer DOSB Boxen A",
] as const

export type TrainerLicense = (typeof trainerLicenseOptions)[number]

function isMissingColumnError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")
  )
}

export type TrainerAccountRecord = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  trainer_license?: TrainerLicense | null
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
  const payload = {
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    trainer_license: input.trainer_license ?? "Keine DOSB-Lizenz",
    password_hash: await hashTrainerPin(input.pin),
    email_verified: false,
    email_verified_at: null,
    email_verification_token: input.email_verification_token,
    is_approved: false,
    approved_at: null,
    role: "trainer",
    linked_member_id: input.linked_member_id ?? null,
  }

  const primary = await supabase
    .from("trainer_accounts")
    .insert([payload])
    .select("*")
    .single()

  if (!primary.error) {
    return primary.data as TrainerAccountRecord
  }

  if (!isMissingColumnError(primary.error)) {
    throw primary.error
  }

  const fallbackPayload = {
    first_name: payload.first_name,
    last_name: payload.last_name,
    email: payload.email,
    phone: payload.phone,
    trainer_license: payload.trainer_license,
    password_hash: payload.password_hash,
    email_verified: payload.email_verified,
    email_verified_at: payload.email_verified_at,
    email_verification_token: payload.email_verification_token,
    is_approved: payload.is_approved,
    approved_at: payload.approved_at,
    role: payload.role,
  }
  const fallback = await supabase
    .from("trainer_accounts")
    .insert([fallbackPayload])
    .select("*")
    .single()

  if (fallback.error) throw fallback.error
  return fallback.data as TrainerAccountRecord
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
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data as TrainerAccountRecord[] | null) ?? []
}

export async function approveTrainerAccount(id: string) {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({
      is_approved: true,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single()

  if (error) throw error
  return data as TrainerAccountRecord
}

export async function updateTrainerAccountRole(id: string, role: "trainer" | "admin") {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({ role })
    .eq("id", id)
    .select("*")
    .single()

  if (error) throw error
  return data as TrainerAccountRecord
}

export async function linkTrainerAccountToMember(id: string, memberId: string | null) {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({ linked_member_id: memberId })
    .eq("id", id)
    .select("*")
    .single()

  if (error) throw error
  return data as TrainerAccountRecord
}

export async function updateTrainerAccountPin(id: string, pin: string) {
  const { data, error } = await supabase
    .from("trainer_accounts")
    .update({ password_hash: await hashTrainerPin(pin) })
    .eq("id", id)
    .select("*")
    .single()

  if (error) throw error
  return data as TrainerAccountRecord
}
