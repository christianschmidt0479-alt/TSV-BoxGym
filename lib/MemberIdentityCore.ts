// MemberIdentityCore.ts
// Zentraler Service für Member-Identität und Statuslogik
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { hashAuthSecret, isBcryptHash, verifyAuthSecret } from "@/lib/authSecret"

export type MemberIdentity = {
  id: string
  email: string
  email_verified: boolean
  email_verified_at: string | null
  email_verification_token: string | null
  is_approved: boolean
  is_trial: boolean
  member_pin: string | null
  created_at: string
  base_group?: string | undefined
  first_name?: string | undefined
  last_name?: string | undefined
  is_competition_member?: boolean | undefined
}

const supabase = createServerSupabaseServiceClient()

// 1. Zentrale Prioritätsregel für aktive Member-Identität
export async function resolveActiveMemberByEmail(email: string): Promise<MemberIdentity | null> {
  const normalized = email.trim().toLowerCase()
  const { data, error } = await supabase
    .from("members")
    .select("id, email, email_verified, email_verified_at, email_verification_token, is_approved, is_trial, member_pin, created_at")
    .eq("email", normalized)
    .order("created_at", { ascending: false })
    .limit(10)
  if (error) throw error
  if (!data || data.length === 0) return null
  // 1. verifizierter Datensatz
  const verified = data.find((m) => m.email_verified)
  if (verified) return verified
  // 2. jüngster nicht-verifizierter, nicht-freigegebener
  const notVerifiedNotApproved = data.find((m) => !m.email_verified && !m.is_approved)
  if (notVerifiedNotApproved) return notVerifiedNotApproved
  // 3. jüngster Datensatz
  return data[0]
}

// 2. Lookup mit Pin
export async function resolveActiveMemberByEmailAndPin(email: string, pin: string): Promise<MemberIdentity | null> {
  const member = await resolveActiveMemberByEmail(email)
  if (!member || !member.member_pin) return null
  if (await verifyAuthSecret(pin, member.member_pin)) return member
  return null
}

// 3. Registrierung oder Refresh
export async function registerOrRefreshMember(input: {
  email: string
  member_pin: string
  is_trial: boolean
  email_verification_token: string
  email_verification_expires_at: string
}): Promise<MemberIdentity> {
  const normalized = input.email.trim().toLowerCase()
  // Insert oder Update nach Prioritätsregel
  const active = await resolveActiveMemberByEmail(normalized)
  let memberId: string | null = null
  if (active) {
    // Update
    const { data, error } = await supabase
      .from("members")
      .update({
        member_pin: await hashAuthSecret(input.member_pin),
        is_trial: input.is_trial,
        email_verification_token: input.email_verification_token,
        email_verification_expires_at: input.email_verification_expires_at,
        email_verified: false,
        email_verified_at: null,
      })
      .eq("id", active.id)
      .select("id")
      .single()
    if (error) throw error
    memberId = data.id
  } else {
    // Insert
    const { data, error } = await supabase
      .from("members")
      .insert([
        {
          email: normalized,
          member_pin: await hashAuthSecret(input.member_pin),
          is_trial: input.is_trial,
          email_verification_token: input.email_verification_token,
          email_verification_expires_at: input.email_verification_expires_at,
          email_verified: false,
          email_verified_at: null,
        },
      ])
      .select("id")
      .single()
    if (error) throw error
    memberId = data.id
  }
  // Finalen Datensatz nachlesen
  const member = await resolveActiveMemberByEmail(normalized)
  if (!member) throw new Error("Persistenzfehler: Member nicht auffindbar nach Registrierung")
  return member
}

// 4. Verifizierung per Token
export async function verifyMemberEmail(token: string): Promise<MemberIdentity | null> {
  const { data, error } = await supabase
    .from("members")
    .select("id, email, email_verified, email_verified_at, email_verification_token, is_approved, is_trial, member_pin, created_at")
    .eq("email_verification_token", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  // Update
  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from("members")
    .update({ email_verified: true, email_verified_at: now, email_verification_token: null })
    .eq("id", data.id)
  if (updateError) throw updateError
  // Finalen Datensatz nachlesen
  return await resolveActiveMemberByEmail(data.email)
}

// 5. Member-Area-Lookup
export async function loadMemberAreaForEmail(email: string): Promise<MemberIdentity | null> {
  return resolveActiveMemberByEmail(email)
}

// 6. Check-in-Validierung
export async function validateMemberCheckin(email: string, pin: string): Promise<MemberIdentity | null> {
  return resolveActiveMemberByEmailAndPin(email, pin)
}
