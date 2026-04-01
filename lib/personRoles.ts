import type { TrainerAccountRecord } from "@/lib/trainerDb"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

export type RoleMemberRecord = {
  id: string
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  email?: string | null
  base_group?: string | null
  is_approved?: boolean | null
  is_competition_member?: boolean | null
}

export type PersonRole = "mitglied" | "trainer" | "admin" | "wettkaempfer"

export type PersonRoleState = "bestaetigt" | "offen"

export type PersonRoleProfile = {
  key: string
  displayName: string
  email: string
  member?: RoleMemberRecord | null
  trainer?: TrainerAccountRecord | null
  roles: PersonRole[]
  matchedBy: "linked_member_id" | "email" | "single"
}

function normalizeEmail(email?: string | null) {
  return (email ?? "").trim().toLowerCase()
}

function getDisplayName(input?: {
  first_name?: string | null
  last_name?: string | null
  name?: string | null
}) {
  const full = `${input?.first_name ?? ""} ${input?.last_name ?? ""}`.trim()
  return full || input?.name || "—"
}

function isCompetitionMember(member?: RoleMemberRecord | null) {
  return !!member?.is_competition_member && normalizeTrainingGroup(member.base_group) !== "Boxzwerge"
}

export function buildPersonRoleProfiles(
  members: RoleMemberRecord[],
  trainers: TrainerAccountRecord[]
) {
  const profiles = new Map<string, PersonRoleProfile>()
  const memberById = new Map(members.map((member) => [member.id, member]))
  const memberByEmail = new Map(
    members
      .map((member) => [normalizeEmail(member.email), member] as const)
      .filter(([email]) => email !== "")
  )

  function ensureProfile(key: string, input: Partial<PersonRoleProfile>) {
    const existing = profiles.get(key)
    if (existing) return existing

    const profile: PersonRoleProfile = {
      key,
      displayName: input.displayName || "—",
      email: input.email || "",
      member: input.member ?? null,
      trainer: input.trainer ?? null,
      roles: input.roles ?? [],
      matchedBy: input.matchedBy ?? "single",
    }
    profiles.set(key, profile)
    return profile
  }

  for (const member of members) {
    const key = `member:${member.id}`
    const roles: PersonRole[] = ["mitglied"]
    if (isCompetitionMember(member)) roles.push("wettkaempfer")

    ensureProfile(key, {
      displayName: getDisplayName(member),
      email: normalizeEmail(member.email),
      member,
      roles,
      matchedBy: "single",
    })
  }

  for (const trainer of trainers) {
    const explicitMember =
      trainer.linked_member_id && memberById.has(trainer.linked_member_id)
        ? memberById.get(trainer.linked_member_id) ?? null
        : null
    const emailMatch =
      !explicitMember && normalizeEmail(trainer.email)
        ? memberByEmail.get(normalizeEmail(trainer.email)) ?? null
        : null
    const matchedMember = explicitMember ?? emailMatch

    const key = matchedMember ? `member:${matchedMember.id}` : `trainer:${trainer.id}`
    const profile = ensureProfile(key, {
      displayName: getDisplayName(matchedMember ?? trainer),
      email: normalizeEmail(trainer.email),
      member: matchedMember ?? null,
      trainer,
      matchedBy: explicitMember ? "linked_member_id" : matchedMember ? "email" : "single",
      roles: [],
    })

    profile.trainer = trainer
    profile.displayName = getDisplayName(matchedMember ?? trainer)
    profile.email = normalizeEmail(trainer.email) || profile.email

    const nextRoles = new Set<PersonRole>(profile.roles)
    if (matchedMember) {
      nextRoles.add("mitglied")
      if (isCompetitionMember(matchedMember)) nextRoles.add("wettkaempfer")
    }
    nextRoles.add("trainer")
    if (trainer.role === "admin") nextRoles.add("admin")
    profile.roles = Array.from(nextRoles)
    profile.matchedBy = explicitMember ? "linked_member_id" : matchedMember ? "email" : "single"
  }

  return Array.from(profiles.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, "de"))
}

export function getPersonRoleState(profile: PersonRoleProfile, role: PersonRole): PersonRoleState {
  switch (role) {
    case "mitglied":
      return profile.member?.is_approved ? "bestaetigt" : "offen"
    case "trainer":
      return profile.trainer?.is_approved ? "bestaetigt" : "offen"
    case "admin":
      return profile.trainer?.role === "admin" && profile.trainer?.is_approved ? "bestaetigt" : "offen"
    case "wettkaempfer":
      return isCompetitionMember(profile.member) ? "bestaetigt" : "offen"
  }
}
