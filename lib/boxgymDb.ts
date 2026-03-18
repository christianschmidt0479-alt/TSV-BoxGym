import { supabase } from "@/lib/supabaseClient"

type MemberInput = {
  first_name: string
  last_name: string
  birthdate: string
  email?: string
  phone?: string
  is_trial: boolean
  member_pin?: string
  is_approved?: boolean
  base_group?: string
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

export async function findMemberByFirstLastAndPin(
  firstName: string,
  lastName: string,
  pin: string
) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("first_name", firstName)
    .eq("last_name", lastName)
    .eq("member_pin", pin)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error
  return data?.[0] ?? null
}

export async function createMember(input: MemberInput) {
  const fullName = `${input.first_name.trim()} ${input.last_name.trim()}`.trim()

  const { data, error } = await supabase
    .from("members")
    .insert([
      {
        name: fullName,
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
        birthdate: input.birthdate,
        email: input.email || null,
        phone: input.phone || null,
        is_trial: input.is_trial,
        trial_count: input.is_trial ? 1 : 0,
        member_pin: input.member_pin || null,
        is_approved: input.is_approved ?? false,
        base_group: input.base_group || null,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data
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
  input: { email?: string; phone?: string }
) {
  const { data, error } = await supabase
    .from("members")
    .update({
      email: input.email || null,
      phone: input.phone || null,
    })
    .eq("id", memberId)
    .select()
    .single()

  if (error) throw error
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
  const { data, error } = await supabase
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

  if (error) throw error
  return data || []
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