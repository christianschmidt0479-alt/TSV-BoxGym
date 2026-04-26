export type TrainerRole = "trainer" | "admin" | ""

type TrainerAccessRecord = {
  role: TrainerRole
  sessionUntil: number
  accountRole: TrainerRole
  linkedMemberId: string | null
  accountEmail: string
  accountFirstName: string
  accountLastName: string
}

type TrainerAccessIdentity = {
  email?: string | null
  firstName?: string | null
  lastName?: string | null
}

const STORAGE_KEY = "tsv_trainer_access"
export const TRAINER_ACCESS_EVENT = "tsv:trainer-access-changed"

const EMPTY_ACCESS: TrainerAccessRecord = {
  role: "",
  sessionUntil: 0,
  accountRole: "",
  linkedMemberId: null,
  accountEmail: "",
  accountFirstName: "",
  accountLastName: "",
}

function isBrowser() {
  return typeof window !== "undefined"
}

function dispatchTrainerAccessEvent() {
  if (!isBrowser()) return
  window.dispatchEvent(new Event(TRAINER_ACCESS_EVENT))
}

function sanitizeRole(role: string | null | undefined): TrainerRole {
  return role === "admin" ? "admin" : role === "trainer" ? "trainer" : ""
}

function sanitizeRecord(value: unknown): TrainerAccessRecord {
  if (!value || typeof value !== "object") return EMPTY_ACCESS
  const row = value as Record<string, unknown>
  const sessionUntil = Number(row.sessionUntil)
  if (!Number.isFinite(sessionUntil) || sessionUntil <= Date.now()) {
    return EMPTY_ACCESS
  }

  return {
    role: sanitizeRole(typeof row.role === "string" ? row.role : null),
    sessionUntil,
    accountRole: sanitizeRole(typeof row.accountRole === "string" ? row.accountRole : null),
    linkedMemberId: typeof row.linkedMemberId === "string" && row.linkedMemberId.trim() ? row.linkedMemberId : null,
    accountEmail: typeof row.accountEmail === "string" ? row.accountEmail : "",
    accountFirstName: typeof row.accountFirstName === "string" ? row.accountFirstName : "",
    accountLastName: typeof row.accountLastName === "string" ? row.accountLastName : "",
  }
}

export function readTrainerAccess(): TrainerAccessRecord {
  if (!isBrowser()) return EMPTY_ACCESS

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_ACCESS

    const parsed = sanitizeRecord(JSON.parse(raw))
    if (!parsed.sessionUntil) {
      window.localStorage.removeItem(STORAGE_KEY)
      return EMPTY_ACCESS
    }

    return parsed
  } catch {
    return EMPTY_ACCESS
  }
}

export function persistTrainerAccess(
  role: TrainerRole,
  sessionUntil: number,
  accountRole: TrainerRole,
  linkedMemberId: string | null,
  identity?: TrainerAccessIdentity,
) {
  if (!isBrowser()) return

  const record: TrainerAccessRecord = {
    role: sanitizeRole(role),
    sessionUntil: Number.isFinite(sessionUntil) ? sessionUntil : 0,
    accountRole: sanitizeRole(accountRole),
    linkedMemberId: linkedMemberId?.trim() || null,
    accountEmail: identity?.email?.trim() ?? "",
    accountFirstName: identity?.firstName?.trim() ?? "",
    accountLastName: identity?.lastName?.trim() ?? "",
  }

  if (!record.role || !record.accountRole || !record.sessionUntil) {
    window.localStorage.removeItem(STORAGE_KEY)
    dispatchTrainerAccessEvent()
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  dispatchTrainerAccessEvent()
}

export async function clearTrainerAccessSession(options?: { remote?: boolean }) {
  if (isBrowser()) {
    window.localStorage.removeItem(STORAGE_KEY)
    dispatchTrainerAccessEvent()
  }

  if (options?.remote === false) return

  try {
    await fetch("/api/trainer-session", { method: "DELETE" })
  } catch {
    // ignore client-side logout refresh failures
  }
}
