import { supabase } from "./supabaseClient"
import { verifyTrainerPinHash } from "./trainerPin"

function isMissingColumnError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")
  )
}

function withoutOptionalMemberFields<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== "guardian_name" && key !== "gender")
  ) as Omit<T, "guardian_name" | "gender">
}

type MemberInput = {
  first_name: string
  last_name: string
  birthdate: string
  gender?: string
  email?: string
  phone?: string
  guardian_name?: string
  is_trial: boolean
  member_pin?: string
  is_approved?: boolean
  base_group?: string
}

export type MemberAuthResult =
  | {
      status: "success"
      member: Record<string, unknown>
    }
  | {
      status: "missing_email"
    }

type TrainerRecord = {
  id: string
  first_name: string
  last_name: string
  email: string
  password_hash: string
  email_verified: boolean
  is_approved: boolean
  role?: "trainer" | "admin"
  linked_member_id?: string | null
}

export type TrainerCredentialsMatch = TrainerRecord & {
  role: "trainer" | "admin"
}

export async function findTrainerByEmailAndPin(email: string, pin: string): Promise<TrainerCredentialsMatch | null> {
  const normalizedEmail = email.trim().toLowerCase()
  const { data, error } = await supabase
    .from("trainer_accounts")
    .select("*")
    .eq("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error

  const trainer = (data?.[0] as TrainerRecord | undefined) ?? null
  if (!trainer) return null
  if (!trainer.email_verified || !trainer.is_approved) return null

  if (!(await verifyTrainerPinHash(pin, trainer.password_hash))) return null

  const resolvedTrainer = {
    ...trainer,
    role: trainer.role === "admin" ? "admin" : "trainer",
  } as TrainerCredentialsMatch

  return resolvedTrainer
}

export async function findMemberByNameAndBirthdate(name: string, birthdate: string) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("name", name)
    .eq("birthdate", birthdate)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error
  return data?.[0] ?? null
}

export async function findMemberByFirstLastAndBirthdate(
  firstName: string,
  lastName: string,
  birthdate: string
) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("first_name", firstName)
    .eq("last_name", lastName)
    .eq("birthdate", birthdate)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error
  return data?.[0] ?? null
}

export async function findMemberByEmailAndPin(email: string, pin: string): Promise<MemberAuthResult | null> {
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedPin = pin.trim()

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("member_pin", normalizedPin)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error

  const member = data?.[0] ?? null
  if (member) {
    return {
      status: "success",
      member,
    }
  }

  const { data: missingEmailRows, error: missingEmailError } = await supabase
    .from("members")
    .select("id")
    .eq("member_pin", normalizedPin)
    .or("email.is.null,email.eq.")
    .limit(1)

  if (missingEmailError) throw missingEmailError

  if ((missingEmailRows?.length ?? 0) > 0) {
    return {
      status: "missing_email",
    }
  }

  return null
}

export async function findMemberById(memberId: string) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function findMemberByEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("email", normalized)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error
  return data?.[0] ?? null
}

export async function findMemberByFirstLastName(firstName: string, lastName: string) {
  const normalizedFirstName = firstName.trim()
  const normalizedLastName = lastName.trim()

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("first_name", normalizedFirstName)
    .eq("last_name", normalizedLastName)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error
  return data?.[0] ?? null
}

export async function createMember(input: MemberInput) {
  const fullName = `${input.first_name.trim()} ${input.last_name.trim()}`.trim()
  const payload = {
    name: fullName,
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    birthdate: input.birthdate,
    gender: input.gender || null,
    email: input.email || null,
    phone: input.phone || null,
    guardian_name: input.guardian_name || null,
    is_trial: input.is_trial,
    trial_count: input.is_trial ? 1 : 0,
    member_pin: input.member_pin || null,
    is_approved: input.is_approved ?? false,
    base_group: input.base_group || null,
  }

  const primary = await supabase
    .from("members")
    .insert([payload])
    .select()
    .single()

  if (!primary.error) {
    return primary.data
  }

  if (!isMissingColumnError(primary.error)) {
    throw primary.error
  }

  const fallback = await supabase
    .from("members")
    .insert([withoutOptionalMemberFields(payload)])
    .select()
    .single()

  if (fallback.error) throw fallback.error
  return fallback.data
}

export async function updateTrialMember(
  memberId: string,
  trialCount: number,
  email?: string,
  phone?: string
) {
  const { data, error } = await supabase
    .from("members")
    .update({
      trial_count: trialCount,
      email: email || null,
      phone: phone || null,
    })
    .eq("id", memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function setMemberPin(memberId: string, pin: string) {
  const { data, error } = await supabase
    .from("members")
    .update({ member_pin: pin })
    .eq("id", memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function resetMemberPin(memberId: string, newPin: string) {
  const { data, error } = await supabase
    .from("members")
    .update({ member_pin: newPin })
    .eq("id", memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateMemberProfile(
  memberId: string,
  input: { email?: string; phone?: string; member_pin?: string }
) {
  const { data, error } = await supabase
    .from("members")
    .update({
      email: input.email || null,
      phone: input.phone || null,
      ...(input.member_pin ? { member_pin: input.member_pin } : {}),
    })
    .eq("id", memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateMemberContactData(
  memberId: string,
  input: { email?: string; phone?: string; guardian_name?: string }
) {
  const payload = {
    email: input.email || null,
    phone: input.phone || null,
    guardian_name: input.guardian_name || null,
  }

  const primary = await supabase
    .from("members")
    .update(payload)
    .eq("id", memberId)
    .select()
    .single()

  if (!primary.error) {
    return primary.data
  }

  if (!isMissingColumnError(primary.error)) {
    throw primary.error
  }

  const fallback = await supabase
    .from("members")
    .update(withoutOptionalMemberFields(payload))
    .eq("id", memberId)
    .select()
    .single()

  if (fallback.error) throw fallback.error
  return fallback.data
}

export async function updateMemberRegistrationData(
  memberId: string,
  input: Record<string, unknown> & { guardian_name?: string | null }
) {
  const primary = await supabase
    .from("members")
    .update(input)
    .eq("id", memberId)
    .select()
    .single()

  if (!primary.error) {
    return primary.data
  }

  if (!isMissingColumnError(primary.error)) {
    throw primary.error
  }

  const fallback = await supabase
    .from("members")
    .update(withoutOptionalMemberFields(input))
    .eq("id", memberId)
    .select()
    .single()

  if (fallback.error) throw fallback.error
  return fallback.data
}

export async function updateMemberCompetitionData(
  memberId: string,
  input: {
    has_competition_pass?: boolean
    is_competition_member: boolean
    competition_license_number?: string
    last_medical_exam_date?: string
    competition_fights?: number
    competition_wins?: number
    competition_losses?: number
    competition_draws?: number
  }
) {
  const { data, error } = await supabase
    .from("members")
    .update({
      has_competition_pass: input.has_competition_pass ?? false,
      is_competition_member: input.is_competition_member,
      competition_license_number: input.competition_license_number?.trim() || null,
      last_medical_exam_date: input.last_medical_exam_date || null,
      competition_fights: input.competition_fights ?? 0,
      competition_wins: input.competition_wins ?? 0,
      competition_losses: input.competition_losses ?? 0,
      competition_draws: input.competition_draws ?? 0,
    })
    .eq("id", memberId)
    .select()
    .single()

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        "Die Datenbank kennt die Wettkämpferrolle noch nicht. Bitte fuehre zuerst supabase/member_competition_fields.sql in Supabase aus."
      )
    }

    throw error
  }
  return data
}

export async function updateMemberTrainerAssistData(
  memberId: string,
  input: {
    needs_trainer_assist_checkin: boolean
  }
) {
  const { data, error } = await supabase
    .from("members")
    .update({
      needs_trainer_assist_checkin: input.needs_trainer_assist_checkin,
    })
    .eq("id", memberId)
    .select()
    .single()

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        "Die Datenbank kennt die Sonderoption noch nicht. Bitte fuehre zuerst supabase/member_trainer_assist_fields.sql in Supabase aus."
      )
    }

    throw error
  }
  return data
}

export async function approveMember(memberId: string) {
  const { data, error } = await supabase
    .from("members")
    .update({ is_approved: true })
    .eq("id", memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function changeMemberBaseGroup(memberId: string, baseGroup: string) {
  const { data, error } = await supabase
    .from("members")
    .update({ base_group: baseGroup })
    .eq("id", memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getPendingMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("is_trial", false)
    .eq("is_approved", false)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

export async function getAllMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })

  if (error) throw error
  return data || []
}

export async function createCheckin(input: {
  member_id: string
  group_name: string
  weight?: string
  date: string
  time: string
  year: number
  month_key: string
}) {
  const numericWeight =
    input.weight && input.weight.trim() !== ""
      ? Number(input.weight.replace(",", "."))
      : null

  const { data, error } = await supabase
    .from("checkins")
    .insert([
      {
        member_id: input.member_id,
        group_name: input.group_name,
        weight: Number.isNaN(numericWeight) ? null : numericWeight,
        date: input.date,
        time: input.time,
        year: input.year,
        month_key: input.month_key,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getTodayCheckins(date: string) {
  const primaryQuery = await supabase
    .from("checkins")
    .select(`
      *,
      members(
        id,
        name,
        first_name,
        last_name,
        birthdate,
        is_trial,
        email,
        phone,
        guardian_name,
        is_approved,
        base_group
      )
    `)
    .eq("date", date)
    .order("created_at", { ascending: false })

  if (!primaryQuery.error) {
    return primaryQuery.data || []
  }

  if (!isMissingColumnError(primaryQuery.error)) {
    throw primaryQuery.error
  }

  const fallbackQuery = await supabase
    .from("checkins")
    .select(`
      *,
      members(
        id,
        name,
        first_name,
        last_name,
        birthdate,
        is_trial,
        email,
        phone,
        is_approved,
        base_group
      )
    `)
    .eq("date", date)
    .order("created_at", { ascending: false })

  if (fallbackQuery.error) throw fallbackQuery.error
  return fallbackQuery.data || []
}
export async function updateMemberName(
  memberId: string,
  firstName: string,
  lastName: string
) {
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

  const { data, error } = await supabase
    .from("members")
    .update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      name: fullName,
    })
    .eq("id", memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteMember(memberId: string) {
  const { error: checkinError } = await supabase
    .from("checkins")
    .delete()
    .eq("member_id", memberId)

  if (checkinError) throw checkinError

  const { error: memberError } = await supabase
    .from("members")
    .delete()
    .eq("id", memberId)

  if (memberError) throw memberError

  return true
}
