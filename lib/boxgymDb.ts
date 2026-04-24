import { createServerSupabaseServiceClient } from "./serverSupabase"
import { hashAuthSecret, isBcryptHash, verifyAuthSecret } from "./authSecret"
import type { MemberCheckinMode } from "./memberCheckin"
import { generateMemberQrToken } from "./memberQrToken"
import { normalizeTrainingGroup } from "./trainingGroups"

// boxgymDb wird ausschließlich serverseitig aufgerufen.
// Fehlt der Service-Key, schlägt dies explizit fehl statt auf den anon-Key zu fallen.
const supabase = createServerSupabaseServiceClient()

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
    Object.entries(payload).filter(
      ([key]) =>
        key !== "guardian_name" &&
        key !== "gender" &&
        key !== "created_from_excel"
    )
  ) as Omit<T, "guardian_name" | "gender" | "created_from_excel">
}

function withoutLegacyMemberFallbackFields<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) =>
        key !== "privacy_accepted_at" &&
        key !== "member_qr_token" &&
        key !== "member_qr_active"
    )
  ) as Omit<T, "privacy_accepted_at" | "member_qr_token" | "member_qr_active">
}

function withNormalizedBaseGroup<T extends { base_group?: string | null }>(row: T): T {
  const normalized = normalizeTrainingGroup(row.base_group)
  return normalized ? { ...row, base_group: normalized } : row
}

function withNormalizedGroupName<T extends { group_name?: string | null }>(row: T): T {
  const normalized = normalizeTrainingGroup(row.group_name)
  return normalized ? { ...row, group_name: normalized } : row
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
  email_verification_token?: string
  email_verification_expires_at?: string
}

const SAFE_MEMBER_LIST_SELECT =
  "id, name, first_name, last_name, birthdate, email, phone, guardian_name, email_verified, email_verified_at, privacy_accepted_at, is_trial, is_approved, base_group, office_list_status, office_list_group, office_list_checked_at, is_competition_member, has_competition_pass"

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
  email_verification_token?: string | null
}

export type TrainerCredentialsMatch = TrainerRecord & {
  role: "trainer" | "admin"
  mustChangePassword: boolean
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

  if (!(await verifyAuthSecret(pin, trainer.password_hash))) return null
  if (!isBcryptHash(trainer.password_hash)) {
    const nextHash = await hashAuthSecret(pin)
    await supabase.from("trainer_accounts").update({ password_hash: nextHash }).eq("id", trainer.id)
    trainer.password_hash = nextHash
  }

  const resolvedTrainer = {
    ...trainer,
    role: trainer.role === "admin" ? "admin" : "trainer",
    mustChangePassword: trainer.email_verification_token === "__pw_change_required__",
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



export async function findMemberById(memberId: string) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}


// Dubletten-Prioritätsregel: 1. verifiziert, 2. jüngster nicht-verifizierter, nicht-freigegebener, 3. jüngster
export async function findMemberByEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  const { data, error } = await supabase
    .from("members")
    .select("*")
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
// Dubletten-Prioritätsregel: 1. verifiziert, 2. jüngster nicht-verifizierter, nicht-freigegebener, 3. jüngster
export async function findMemberByEmailAndPin(email: string, pin: string): Promise<MemberAuthResult | null> {
  const normalizedEmail = email.trim().toLowerCase()
  console.log("LOGIN_EMAIL_NORMALIZED", { email: normalizedEmail })
  const pinType = typeof pin
  const pinOriginalLength = pin ? String(pin).length : 0
  const pinTrimmed = pin ? pin.trim() : ""
  const pinTrimmedLength = pinTrimmed.length
  console.log("LOGIN_PIN_PRESENT", {
    present: !!pin,
    typeof: pinType,
    original_length: pinOriginalLength,
    trimmed_length: pinTrimmedLength
  })
  const normalizedPin = pinTrimmed


  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(10)

  if (error) throw error
  const candidateCount = data ? data.length : 0
  const candidateIds = data ? data.map(m => m.id) : []
  const candidateEmails = data ? data.map(m => m.email) : []
  console.log("LOGIN_MEMBER_CANDIDATES_FOUND", {
    count: candidateCount,
    ids: candidateIds,
    emails: candidateEmails
  })
  if (!data || data.length === 0) return null

  // 1. Alle verifizierten Datensätze mit passendem Pin, nach created_at absteigend
  const verified = data.filter((m) => m.email_verified)
  for (const member of verified) {
    console.log("LOGIN_MEMBER_SELECTED", {
      id: member.id,
      email: member.email,
      email_verified: member.email_verified,
      is_approved: member.is_approved,
      member_pin_present: !!member.member_pin
    })
    console.log("LOGIN_COMPARE_START", { id: member.id })
    const passwordOk = await verifyMemberPinValue(normalizedPin, String(member.member_pin ?? ""))
    console.log("LOGIN_COMPARE_RESULT", { id: member.id, passwordOk })
    if (passwordOk) {
      if (!isBcryptHash(String(member.member_pin ?? ""))) {
        await setStoredMemberPin(member.id, normalizedPin)
        member.member_pin = await hashMemberPinValue(normalizedPin)
      }
      return { status: "success", member }
    }
  }

  // 2. Jüngster nicht-verifizierter, nicht-freigegebener mit passendem Pin
  const notVerifiedNotApproved = data.filter((m) => !m.email_verified && !m.is_approved)
  for (const member of notVerifiedNotApproved) {
    console.log("LOGIN_MEMBER_SELECTED", {
      id: member.id,
      email: member.email,
      email_verified: member.email_verified,
      is_approved: member.is_approved,
      member_pin_present: !!member.member_pin
    })
    console.log("LOGIN_COMPARE_START", { id: member.id })
    const passwordOk = await verifyMemberPinValue(normalizedPin, String(member.member_pin ?? ""))
    console.log("LOGIN_COMPARE_RESULT", { id: member.id, passwordOk })
    if (passwordOk) {
      if (!isBcryptHash(String(member.member_pin ?? ""))) {
        await setStoredMemberPin(member.id, normalizedPin)
        member.member_pin = await hashMemberPinValue(normalizedPin)
      }
      return { status: "success", member }
    }
  }

  // 3. Jüngster Datensatz mit passendem Pin
  for (const member of data) {
    console.log("LOGIN_MEMBER_SELECTED", {
      id: member.id,
      email: member.email,
      email_verified: member.email_verified,
      is_approved: member.is_approved,
      member_pin_present: !!member.member_pin
    })
    console.log("LOGIN_COMPARE_START", { id: member.id })
    const passwordOk = await verifyMemberPinValue(normalizedPin, String(member.member_pin ?? ""))
    console.log("LOGIN_COMPARE_RESULT", { id: member.id, passwordOk })
    if (passwordOk) {
      if (!isBcryptHash(String(member.member_pin ?? ""))) {
        await setStoredMemberPin(member.id, normalizedPin)
        member.member_pin = await hashMemberPinValue(normalizedPin)
      }
      return { status: "success", member }
    }
  }

  // Fallback: missing_email-Status wie bisher
  const { data: missingEmailRows, error: missingEmailError } = await supabase
    .from("members")
    .select("id, member_pin")
    .or("email.is.null,email.eq.")
    .order("created_at", { ascending: false })
    .limit(20)

  if (missingEmailError) throw missingEmailError

  for (const row of missingEmailRows ?? []) {
    if (await verifyMemberPinValue(normalizedPin, String(row.member_pin ?? ""))) {
      if (!isBcryptHash(String(row.member_pin ?? ""))) {
        await setStoredMemberPin(row.id, normalizedPin)
      }
      return { status: "missing_email" }
    }
  }

  return null
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
  const memberPinPresent = !!input.member_pin
  console.log("CREATE_MEMBER_ENTRY_MEMBER_PIN_PRESENT", {
    email: input.email,
    member_pin_present: memberPinPresent
  })
  let hashCreated = false
  let memberPinHash: string | null = null
  if (input.member_pin) {
    memberPinHash = await hashMemberPinValue(input.member_pin)
    hashCreated = true
  }
  console.log("CREATE_MEMBER_HASH_CREATED", {
    email: input.email,
    hash_created: hashCreated
  })
  const payload = {
    name: fullName,
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    birthdate: input.birthdate,
    gender: input.gender || null,
    email: input.email || null,
    phone: input.phone || null,
    guardian_name: input.guardian_name || null,
    privacy_accepted_at: new Date().toISOString(),
    is_trial: input.is_trial,
    trial_count: input.is_trial ? 1 : 0,
    member_pin: memberPinHash,
    is_approved: input.is_approved ?? false,
    base_group: normalizeTrainingGroup(input.base_group) || null,
    member_qr_token: generateMemberQrToken(),
    member_qr_active: true,
  }
  console.log("CREATE_MEMBER_PRIMARY_INSERT_START", {
    email: payload.email,
    member_pin_present: !!payload.member_pin
  })
  const primary = await supabase
    .from("members")
    .insert([payload])
    .select()
    .single()

  if (!primary.error) {
    console.log("CREATE_MEMBER_PRIMARY_INSERT_DONE", { email: payload.email })
    // Nach Insert: Rücklesen und Log
    const { data: inserted, error: readError } = await supabase
      .from("members")
      .select("id, email, member_pin")
      .eq("email", payload.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (inserted && inserted.member_pin == null) {
      console.log("CREATE_MEMBER_POSTREAD_MEMBER_PIN_NULL", {
        id: inserted.id,
        email: inserted.email,
        insert_path: "primary"
      })
    }
    return primary.data
  }

  if (!isMissingColumnError(primary.error)) {
    throw primary.error
  }

  console.warn("[createMember] primary insert failed (missing column); retrying ohne optionale Felder", primary.error?.message)
  console.log("CREATE_MEMBER_FALLBACK_INSERT_START", {
    email: payload.email,
    member_pin_present: !!payload.member_pin
  })
  // Fallback: Prüfen, ob member_pin entfernt würde
  const fallbackPayload = withoutOptionalMemberFields(payload)
  if (!('member_pin' in fallbackPayload) || fallbackPayload.member_pin == null) {
    console.error("CREATE_MEMBER_FALLBACK_ABORT", { email: payload.email, reason: "member_pin würde entfernt" })
    throw new Error("[createMember] Fallback-Insert ohne member_pin nicht erlaubt. Registrierung abgebrochen.")
  }
  const fallback = await supabase
    .from("members")
    .insert([fallbackPayload])
    .select()
    .single()

  if (!fallback.error) {
    console.log("CREATE_MEMBER_FALLBACK_INSERT_DONE", { email: fallbackPayload.email })
    // Nach Insert: Rücklesen und Log
    const { data: inserted, error: readError } = await supabase
      .from("members")
      .select("id, email, member_pin")
      .eq("email", fallbackPayload.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (inserted && inserted.member_pin == null) {
      console.log("CREATE_MEMBER_POSTREAD_MEMBER_PIN_NULL", {
        id: inserted.id,
        email: inserted.email,
        insert_path: "fallback"
      })
    }
    return fallback.data
  }

  if (!isMissingColumnError(fallback.error)) {
    throw fallback.error
  }

  console.warn("[createMember] fallback also failed; using last-resort legacy path (privacy+QR stripped)", fallback.error?.message)
  console.log("CREATE_MEMBER_LEGACY_FALLBACK_START", {
    email: fallbackPayload.email,
    member_pin_present: !!fallbackPayload.member_pin
  })
  // Legacy-Fallback: member_pin darf nicht entfernt werden
  const legacyPayload = withoutLegacyMemberFallbackFields(fallbackPayload)
  if (!('member_pin' in legacyPayload) || legacyPayload.member_pin == null) {
    console.error("CREATE_MEMBER_LEGACY_FALLBACK_ABORT", { email: fallbackPayload.email, reason: "member_pin würde entfernt" })
    throw new Error("[createMember] Legacy-Fallback-Insert ohne member_pin nicht erlaubt. Registrierung abgebrochen.")
  }
  const legacyFallback = await supabase
    .from("members")
    .insert([legacyPayload])
    .select()
    .single()

  if (legacyFallback.error) throw legacyFallback.error
  console.log("CREATE_MEMBER_LEGACY_FALLBACK_DONE", { email: legacyPayload.email })
  // Nach Insert: Rücklesen und Log
  const { data: inserted, error: readError } = await supabase
    .from("members")
    .select("id, email, member_pin")
    .eq("email", legacyPayload.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (inserted && inserted.member_pin == null) {
    console.log("CREATE_MEMBER_POSTREAD_MEMBER_PIN_NULL", {
      id: inserted.id,
      email: inserted.email,
      insert_path: "legacy-fallback"
    })
  }
  return legacyFallback.data
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
  return setStoredMemberPin(memberId, pin)
}

export async function resetMemberPin(memberId: string, newPin: string) {
  return setStoredMemberPin(memberId, newPin)
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
      ...(input.member_pin ? { member_pin: await hashMemberPinValue(input.member_pin) } : {}),
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

  // Defensive: Nur Felder schreiben, die wirklich gesetzt und nicht leer sind
  const payload: Record<string, unknown> = {}
  if (typeof input.email === "string" && input.email.trim()) {
    payload.email = input.email.trim()
  }
  if (typeof input.phone === "string" && input.phone.trim()) {
    payload.phone = input.phone.trim()
  }
  if (typeof input.guardian_name === "string" && input.guardian_name.trim()) {
    payload.guardian_name = input.guardian_name.trim()
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

  // Defensive: Nur Felder schreiben, die wirklich gesetzt und nicht leer sind
  const normalizedInput: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (key === "email" || key === "base_group") {
      if (typeof value === "string" && value.trim()) {
        normalizedInput[key] = value.trim()
      }
      // Sonst: Feld nicht setzen
    } else if (key === "member_pin" && typeof value === "string" && value.trim()) {
      normalizedInput.member_pin = await hashMemberPinValue(value)
    } else if (value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "")) {
      normalizedInput[key] = value
    }
  }

  const primary = await supabase
    .from("members")
    .update(normalizedInput)
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
    .update(withoutOptionalMemberFields(normalizedInput))
    .eq("id", memberId)
    .select()
    .single()

  if (fallback.error) throw fallback.error
  return fallback.data
}

async function hashMemberPinValue(value: string) {
  return hashAuthSecret(value)
}

async function verifyMemberPinValue(candidate: string, storedSecret: string) {
  return verifyAuthSecret(candidate, storedSecret)
}

async function setStoredMemberPin(memberId: string, pin: string) {
  const { data, error } = await supabase
    .from("members")
    .update({ member_pin: await hashMemberPinValue(pin) })
    .eq("id", memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function setMemberPinOnly(memberId: string, pin: string) {
  const { error } = await supabase
    .from("members")
    .update({ member_pin: await hashMemberPinValue(pin) })
    .eq("id", memberId)
  if (error) throw error
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
        "Die Datenbank kennt die Wettkämpferrolle noch nicht. Bitte führe zuerst supabase/member_competition_fields.sql in Supabase aus."
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
        "Die Datenbank kennt die Sonderoption noch nicht. Bitte führe zuerst supabase/member_trainer_assist_fields.sql in Supabase aus."
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
    .update({ base_group: normalizeTrainingGroup(baseGroup) || null })
    .eq("id", memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getPendingMembers() {
  const { data, error } = await supabase
    .from("members")
    .select(SAFE_MEMBER_LIST_SELECT)
    .eq("is_trial", false)
    .or("is_approved.is.null,is_approved.eq.false")
    .order("created_at", { ascending: false })

  console.log("PENDING MEMBERS:", data);

  if (error) throw error
  return (data || []).map((row) => withNormalizedBaseGroup(row))
}

export async function getAllMembers() {
  const { data, error } = await supabase
    .from("members")
    .select(SAFE_MEMBER_LIST_SELECT)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })

  if (error) throw error
  return (data || []).map((row) => withNormalizedBaseGroup(row))
}

export async function createCheckin(input: {
  member_id: string
  group_name: string
  checkin_mode: MemberCheckinMode
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
        group_name: normalizeTrainingGroup(input.group_name) || input.group_name,
        checkin_mode: input.checkin_mode,
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
    return (primaryQuery.data || []).map((row) =>
      withNormalizedGroupName({
        ...row,
        members: row.members ? withNormalizedBaseGroup(row.members) : row.members,
      })
    )
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
  return (fallbackQuery.data || []).map((row) =>
    withNormalizedGroupName({
      ...row,
      members: row.members ? withNormalizedBaseGroup(row.members) : row.members,
    })
  )
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
