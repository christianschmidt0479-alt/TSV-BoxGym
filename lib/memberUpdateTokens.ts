import { randomUUID } from "crypto"
import { findMemberByEmailAndPin, findMemberById, updateMemberRegistrationData } from "@/lib/boxgymDb"
import { DEFAULT_APP_BASE_URL, getAppBaseUrl } from "@/lib/mailConfig"
import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

const MEMBER_UPDATE_LINK_WINDOW_MS = 24 * 60 * 60 * 1000

type MemberUpdateTokenRow = {
  id: string
  member_id: string
  token: string
  expires_at: string
  used: boolean
  created_at: string
}

type EditableMemberRecord = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  birthdate?: string | null
  email?: string | null
  phone?: string | null
  guardian_name?: string | null
  base_group?: string | null
}

export type MemberUpdateEditableProfile = {
  id: string
  firstName: string
  lastName: string
  birthdate: string
  email: string
  phone: string
  baseGroup: string
  guardianName: string
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

function isMissingMemberUpdateTokenTableError(error: { message?: string; details?: string; code?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
  const looksMissingTable =
    error?.code === "PGRST204" ||
    error?.code === "42P01" ||
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("schema cache") && message.includes("member_update_tokens"))

  if (!looksMissingTable) return false
  return message.includes("member_update_tokens")
}

function getMemberUpdateMigrationError() {
  return new Error(
    "Die Datenbank kennt member_update_tokens noch nicht. Bitte fuehre zuerst supabase/member_update_tokens.sql in Supabase aus."
  )
}

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() < Date.now()
}

function toEditableProfile(member: EditableMemberRecord): MemberUpdateEditableProfile {
  return {
    id: member.id,
    firstName: member.first_name?.trim() ?? "",
    lastName: member.last_name?.trim() ?? "",
    birthdate: member.birthdate?.trim() ?? "",
    email: member.email?.trim().toLowerCase() ?? "",
    phone: member.phone?.trim() ?? "",
    baseGroup: member.base_group?.trim() ?? "",
    guardianName: member.guardian_name?.trim() ?? "",
  }
}

async function readTokenRow(token: string) {
  const supabase = getServerSupabase()
  const response = await supabase
    .from("member_update_tokens")
    .select("id, member_id, token, expires_at, used, created_at")
    .eq("token", token)
    .maybeSingle()

  if (response.error) {
    if (isMissingMemberUpdateTokenTableError(response.error)) {
      throw getMemberUpdateMigrationError()
    }

    throw response.error
  }

  return (response.data as MemberUpdateTokenRow | null) ?? null
}

async function markTokenUsed(tokenId: string) {
  const supabase = getServerSupabase()
  const response = await supabase.from("member_update_tokens").update({ used: true }).eq("id", tokenId)

  if (response.error) {
    if (isMissingMemberUpdateTokenTableError(response.error)) {
      throw getMemberUpdateMigrationError()
    }

    throw response.error
  }
}

async function readEditableMember(memberId: string) {
  const member = (await findMemberById(memberId)) as EditableMemberRecord | null
  return member
}

async function readActiveTokenWithMember(token: string) {
  const tokenRow = await readTokenRow(token)
  if (!tokenRow || tokenRow.used) {
    return { status: "invalid" as const, tokenRow: null, member: null }
  }

  if (isExpired(tokenRow.expires_at)) {
    await markTokenUsed(tokenRow.id)
    return { status: "expired" as const, tokenRow, member: null }
  }

  const member = await readEditableMember(tokenRow.member_id)
  if (!member) {
    await markTokenUsed(tokenRow.id)
    return { status: "invalid" as const, tokenRow, member: null }
  }

  return { status: "valid" as const, tokenRow, member }
}

async function verifyPasswordForMember(member: EditableMemberRecord, password: string) {
  const email = member.email?.trim().toLowerCase()
  if (!email) {
    return false
  }

  const match = await findMemberByEmailAndPin(email, password)
  return Boolean(match && match.status === "success" && match.member.id === member.id)
}

export async function createMemberUpdateLink(memberId: string, options?: { baseUrl?: string }) {
  const member = await readEditableMember(memberId)
  if (!member) {
    throw new Error("Mitglied fuer Datenaenderungs-Link nicht gefunden.")
  }

  if (!member.email?.trim()) {
    throw new Error("Mitglied hat keine E-Mail-Adresse fuer den Datenaenderungs-Link.")
  }

  const supabase = getServerSupabase()
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + MEMBER_UPDATE_LINK_WINDOW_MS).toISOString()

  const invalidateResponse = await supabase
    .from("member_update_tokens")
    .update({ used: true })
    .eq("member_id", memberId)
    .eq("used", false)

  if (invalidateResponse.error) {
    if (isMissingMemberUpdateTokenTableError(invalidateResponse.error)) {
      throw getMemberUpdateMigrationError()
    }

    throw invalidateResponse.error
  }

  const insertResponse = await supabase
    .from("member_update_tokens")
    .insert({
      member_id: memberId,
      token,
      expires_at: expiresAt,
      used: false,
    })

  if (insertResponse.error) {
    if (isMissingMemberUpdateTokenTableError(insertResponse.error)) {
      throw getMemberUpdateMigrationError()
    }

    throw insertResponse.error
  }

  const baseUrl = (options?.baseUrl?.trim() || getAppBaseUrl() || DEFAULT_APP_BASE_URL).replace(/\/+$/, "")
  return {
    url: `${baseUrl}/mitglied/daten-aendern?token=${encodeURIComponent(token)}`,
    expiresAt,
  }
}

export async function readMemberUpdateLinkStatus(token: string) {
  const state = await readActiveTokenWithMember(token)

  if (state.status === "expired") {
    return {
      valid: false,
      message: "Link ungültig oder abgelaufen",
    }
  }

  if (state.status !== "valid") {
    return {
      valid: false,
      message: "Link ungültig oder abgelaufen",
    }
  }

  return {
    valid: true,
  }
}

export async function unlockMemberUpdateProfile(token: string, password: string) {
  const state = await readActiveTokenWithMember(token)
  if (state.status !== "valid" || !state.member) {
    return {
      ok: false,
      status: 404,
      message: "Link ungültig oder abgelaufen",
    }
  }

  const passwordOk = await verifyPasswordForMember(state.member, password)
  if (!passwordOk) {
    return {
      ok: false,
      status: 401,
      message: "Passwort nicht korrekt.",
    }
  }

  return {
    ok: true,
    member: toEditableProfile(state.member),
  }
}

export async function updateMemberViaToken(input: {
  token: string
  password: string
  firstName: string
  lastName: string
  birthdate: string
  phone?: string
  baseGroup?: string
  guardianName?: string
}) {
  const state = await readActiveTokenWithMember(input.token)
  if (state.status !== "valid" || !state.member || !state.tokenRow) {
    return {
      ok: false,
      status: 404,
      message: "Link ungültig oder abgelaufen",
    }
  }

  const passwordOk = await verifyPasswordForMember(state.member, input.password)
  if (!passwordOk) {
    return {
      ok: false,
      status: 401,
      message: "Passwort nicht korrekt.",
    }
  }

  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const birthdate = input.birthdate.trim()
  const phone = input.phone?.trim() ?? ""
  const guardianName = input.guardianName?.trim() ?? ""
  const normalizedBaseGroup = normalizeTrainingGroup(input.baseGroup) || input.baseGroup?.trim() || ""

  const fullName = `${firstName} ${lastName}`.trim()
  const updated = (await updateMemberRegistrationData(state.member.id, {
    name: fullName || null,
    first_name: firstName,
    last_name: lastName,
    birthdate,
    phone: phone || null,
    base_group: normalizedBaseGroup || null,
    guardian_name: guardianName || null,
  })) as EditableMemberRecord

  await markTokenUsed(state.tokenRow.id)

  return {
    ok: true,
    member: toEditableProfile(updated),
  }
}