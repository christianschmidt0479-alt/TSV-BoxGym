// Ferienmodus: Erlaubte Gruppen (ohne Boxzwerge)
export const FERIEN_CHECKIN_GROUPS = [
  "Basic 10 - 14 Jahre",
  "Basic 15 - 18 Jahre",
  "Basic Ü18",
  "L-Gruppe",
] as const

export const MAX_TRAININGS_WITHOUT_APPROVAL = 8

// --- Zentrale Eligibility-Funktion für Member-Check-in ---

export type CheckinEligibilityReason =
  | "member_not_found"
  | "email_not_verified"
  | "group_not_allowed"
  | "outside_time_window"
  | "eligible"

export type CheckinEligibilityResult =
  | { eligible: true; reason: "eligible" }
  | { eligible: false; reason: Exclude<CheckinEligibilityReason, "eligible"> }

export function checkMemberEligibility({
  member,
  groupAllowed,
  timeAllowed,
}: {
  member: { id?: string; email_verified?: boolean | null; base_group?: string | null } | null
  groupAllowed: boolean
  timeAllowed: boolean
}): CheckinEligibilityResult {
  if (!member) return { eligible: false, reason: "member_not_found" }
  if (!member.email_verified) return { eligible: false, reason: "email_not_verified" }
  if (!groupAllowed) return { eligible: false, reason: "group_not_allowed" }
  if (!timeAllowed) return { eligible: false, reason: "outside_time_window" }
  return { eligible: true, reason: "eligible" }
}
import { sessions, type Session } from "@/lib/boxgymSessions"
import { getActiveCheckinSession } from "@/lib/checkinWindow"
import { normalizeTrainingGroup } from "@/lib/trainingGroups"

export type MemberCheckinMode = "normal" | "ferien"

export function getDayKeyFromIsoDate(dateString: string): Session["dayKey"] | "" {
  const date = new Date(`${dateString}T12:00:00`)
  const day = date.getDay()

  switch (day) {
    case 1:
      return "Montag"
    case 2:
      return "Dienstag"
    case 3:
      return "Mittwoch"
    case 4:
      return "Donnerstag"
    case 5:
      return "Freitag"
    default:
      return ""
  }
}

export function getSessionsForDate(dateString: string) {
  const dayKey = getDayKeyFromIsoDate(dateString)
  return sessions.filter((session) => session.dayKey === dayKey)
}

export function getAvailableSessionsForToday(dateString: string) {
  return getSessionsForDate(dateString).map((session) => ({
    group: normalizeTrainingGroup(session.group) || session.group,
    time: session.start,
  }))
}

export function getMemberCheckinMode(disableCheckinTimeWindow: boolean): MemberCheckinMode {
  return disableCheckinTimeWindow ? "ferien" : "normal"
}

export function getMemberCheckinModeLabel(mode?: string | null) {
  return mode === "ferien" ? "Ferien" : "Normal"
}

export function isAdultBaseGroup(baseGroup?: string | null) {
  return normalizeTrainingGroup(baseGroup) === "Basic Ü18"
}

export function resolveMemberCheckinAssignment({
  dailySessions,
  now,
  baseGroup,
  mode,
  selectedGroup,
  availableGroups,
  allowOutsideWindowGroupFallback,
}: {
  dailySessions: Session[]
  now: Date
  baseGroup?: string | null
  mode: MemberCheckinMode
  selectedGroup?: string
  availableGroups?: string[]
  allowOutsideWindowGroupFallback?: boolean
}) {
  const normalizedBaseGroup = normalizeTrainingGroup(baseGroup)
  const normalizedSelectedGroup = normalizeTrainingGroup(selectedGroup) || selectedGroup || ""
  const normalizedAvailableGroups = (availableGroups ?? []).map(
    (group) => normalizeTrainingGroup(group) || group
  )

  if (mode === "ferien") {
    return {
      allowed: true,
      groupName: normalizedBaseGroup || null,
      session: null,
      isAdult: false,
    }
  }

  const ownGroupSessions = dailySessions.filter(
    (session) => (normalizeTrainingGroup(session.group) || session.group) === normalizedBaseGroup
  )

  if (ownGroupSessions.length === 0) {
    const hasValidSelectedGroup =
      mode === "normal" &&
      Boolean(normalizedSelectedGroup) &&
      normalizedAvailableGroups.includes(normalizedSelectedGroup)

    if (hasValidSelectedGroup) {
      const selectedSessions = dailySessions.filter(
        (session) => (normalizeTrainingGroup(session.group) || session.group) === normalizedSelectedGroup
      )
      const activeSelectedSession = getActiveCheckinSession(now, selectedSessions)

      return {
        allowed: Boolean(activeSelectedSession),
        groupName: normalizedSelectedGroup,
        session: activeSelectedSession,
        isAdult: false,
      }
    }

    return {
      allowed: false,
      groupName: null,
      session: null,
      isAdult: false,
      reason: "no_own_session_today" as const,
    }
  }

  const activeSession = getActiveCheckinSession(now, ownGroupSessions)

  if (!activeSession && allowOutsideWindowGroupFallback && normalizedBaseGroup) {
    return {
      allowed: false,
      groupName: normalizedBaseGroup,
      session: null,
      isAdult: false,
      reason: "outside_time_window" as const,
    }
  }

  return {
    allowed: Boolean(activeSession),
    groupName: activeSession ? normalizedBaseGroup : null,
    session: activeSession,
    isAdult: false,
    reason: activeSession ? undefined : ("outside_time_window" as const),
  }
}

export function resolveNormalMemberCheckinSession({
  dailySessions,
  now,
  baseGroup,
}: {
  dailySessions: Session[]
  now: Date
  baseGroup?: string | null
}) {
  const normalizedBaseGroup = normalizeTrainingGroup(baseGroup)
  if (!normalizedBaseGroup) return null

  const allowedSessions = dailySessions.filter(
    (session) => (normalizeTrainingGroup(session.group) || session.group) === normalizedBaseGroup
  )

  if (allowedSessions.length === 0) return null
  return getActiveCheckinSession(now, allowedSessions)
}
