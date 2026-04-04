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
}: {
  dailySessions: Session[]
  now: Date
  baseGroup?: string | null
  mode: MemberCheckinMode
}) {
  const normalizedBaseGroup = normalizeTrainingGroup(baseGroup)
  const isAdult = normalizedBaseGroup === "Basic Ü18"

  if (isAdult) {
    const activeSession = mode === "normal" ? getActiveCheckinSession(now, dailySessions) : null
    const activeGroup = activeSession ? normalizeTrainingGroup(activeSession.group) || activeSession.group : null

    return {
      allowed: true,
      groupName: activeGroup === "L-Gruppe" ? "L-Gruppe" : "Basic Ü18",
      session:
        activeGroup === "L-Gruppe"
          ? activeSession
          : dailySessions.find((session) => (normalizeTrainingGroup(session.group) || session.group) === "Basic Ü18") ?? null,
      isAdult: true,
    }
  }

  if (mode === "ferien") {
    return {
      allowed: Boolean(normalizedBaseGroup),
      groupName: normalizedBaseGroup || null,
      session: null,
      isAdult: false,
    }
  }

  const activeSession = getActiveCheckinSession(now, dailySessions)
  return {
    allowed: Boolean(activeSession),
    groupName: activeSession ? normalizeTrainingGroup(activeSession.group) || activeSession.group : null,
    session: activeSession,
    isAdult: false,
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
