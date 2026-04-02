export const TRAINER_SESSION_STORAGE_KEY = "tsv_trainer_session_until"
export const TRAINER_ROLE_STORAGE_KEY = "tsv_trainer_role"
export const TRAINER_ACCOUNT_ROLE_STORAGE_KEY = "tsv_trainer_account_role"
export const TRAINER_LINKED_MEMBER_ID_STORAGE_KEY = "tsv_trainer_linked_member_id"
export const TRAINER_ACCOUNT_EMAIL_STORAGE_KEY = "tsv_trainer_account_email"
export const TRAINER_ACCOUNT_FIRST_NAME_STORAGE_KEY = "tsv_trainer_account_first_name"
export const TRAINER_ACCOUNT_LAST_NAME_STORAGE_KEY = "tsv_trainer_account_last_name"
export const TRAINER_ACCESS_EVENT = "tsv-trainer-access-changed"
export const TRAINER_SESSION_MAX_AGE_MS = 10 * 60 * 1000

export type TrainerRole = "admin" | "trainer" | ""

export function readTrainerAccess() {
  if (typeof window === "undefined") {
    return {
      role: "" as TrainerRole,
      accountRole: "" as TrainerRole,
      linkedMemberId: null as string | null,
      accountEmail: "",
      accountFirstName: "",
      accountLastName: "",
      sessionUntil: 0,
    }
  }

  try {
    const storedRoleRaw = window.localStorage.getItem(TRAINER_ROLE_STORAGE_KEY)
    const storedAccountRoleRaw = window.localStorage.getItem(TRAINER_ACCOUNT_ROLE_STORAGE_KEY)
    const storedLinkedMemberIdRaw = window.localStorage.getItem(TRAINER_LINKED_MEMBER_ID_STORAGE_KEY)
    const storedAccountEmailRaw = window.localStorage.getItem(TRAINER_ACCOUNT_EMAIL_STORAGE_KEY)
    const storedAccountFirstNameRaw = window.localStorage.getItem(TRAINER_ACCOUNT_FIRST_NAME_STORAGE_KEY)
    const storedAccountLastNameRaw = window.localStorage.getItem(TRAINER_ACCOUNT_LAST_NAME_STORAGE_KEY)
    const storedUntilRaw = window.localStorage.getItem(TRAINER_SESSION_STORAGE_KEY)
    const role = storedRoleRaw ? (JSON.parse(storedRoleRaw) as TrainerRole) : ""
    const accountRole = storedAccountRoleRaw ? (JSON.parse(storedAccountRoleRaw) as TrainerRole) : role
    const linkedMemberId = storedLinkedMemberIdRaw ? (JSON.parse(storedLinkedMemberIdRaw) as string | null) : null
    const accountEmail = storedAccountEmailRaw ? (JSON.parse(storedAccountEmailRaw) as string) : ""
    const accountFirstName = storedAccountFirstNameRaw ? (JSON.parse(storedAccountFirstNameRaw) as string) : ""
    const accountLastName = storedAccountLastNameRaw ? (JSON.parse(storedAccountLastNameRaw) as string) : ""
    const sessionUntil = storedUntilRaw ? Number(JSON.parse(storedUntilRaw)) : 0

    if (!sessionUntil || sessionUntil <= Date.now()) {
      return {
        role: "" as TrainerRole,
        accountRole: "" as TrainerRole,
        linkedMemberId: null as string | null,
        accountEmail: "",
        accountFirstName: "",
        accountLastName: "",
        sessionUntil: 0,
      }
    }

    return { role, accountRole, linkedMemberId, accountEmail, accountFirstName, accountLastName, sessionUntil }
  } catch {
    return {
      role: "" as TrainerRole,
      accountRole: "" as TrainerRole,
      linkedMemberId: null as string | null,
      accountEmail: "",
      accountFirstName: "",
      accountLastName: "",
      sessionUntil: 0,
    }
  }
}

function notifyTrainerAccessChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(TRAINER_ACCESS_EVENT))
}

export function persistTrainerAccess(
  role: TrainerRole,
  sessionUntil: number,
  accountRole?: TrainerRole,
  linkedMemberId?: string | null,
  accountIdentity?: {
    email?: string | null
    firstName?: string | null
    lastName?: string | null
  }
) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(TRAINER_ROLE_STORAGE_KEY, JSON.stringify(role))
  window.localStorage.setItem(TRAINER_ACCOUNT_ROLE_STORAGE_KEY, JSON.stringify(accountRole ?? role))
  window.localStorage.setItem(TRAINER_LINKED_MEMBER_ID_STORAGE_KEY, JSON.stringify(linkedMemberId ?? null))
  window.localStorage.setItem(TRAINER_ACCOUNT_EMAIL_STORAGE_KEY, JSON.stringify(accountIdentity?.email?.trim().toLowerCase() ?? ""))
  window.localStorage.setItem(TRAINER_ACCOUNT_FIRST_NAME_STORAGE_KEY, JSON.stringify(accountIdentity?.firstName?.trim() ?? ""))
  window.localStorage.setItem(TRAINER_ACCOUNT_LAST_NAME_STORAGE_KEY, JSON.stringify(accountIdentity?.lastName?.trim() ?? ""))
  window.localStorage.setItem(TRAINER_SESSION_STORAGE_KEY, JSON.stringify(sessionUntil))
  notifyTrainerAccessChanged()
}

export function clearTrainerAccess() {
  if (typeof window === "undefined") return

  window.localStorage.setItem(TRAINER_ROLE_STORAGE_KEY, JSON.stringify(""))
  window.localStorage.setItem(TRAINER_ACCOUNT_ROLE_STORAGE_KEY, JSON.stringify(""))
  window.localStorage.setItem(TRAINER_LINKED_MEMBER_ID_STORAGE_KEY, JSON.stringify(null))
  window.localStorage.setItem(TRAINER_ACCOUNT_EMAIL_STORAGE_KEY, JSON.stringify(""))
  window.localStorage.setItem(TRAINER_ACCOUNT_FIRST_NAME_STORAGE_KEY, JSON.stringify(""))
  window.localStorage.setItem(TRAINER_ACCOUNT_LAST_NAME_STORAGE_KEY, JSON.stringify(""))
  window.localStorage.setItem(TRAINER_SESSION_STORAGE_KEY, JSON.stringify(0))
  notifyTrainerAccessChanged()
}

type ClearTrainerAccessSessionOptions = {
  remote?: boolean
  logErrors?: boolean
}

export async function clearTrainerAccessSession(options?: ClearTrainerAccessSessionOptions) {
  const remote = options?.remote ?? true
  const logErrors = options?.logErrors ?? false

  try {
    if (remote) {
      await fetch("/api/trainer-auth", {
        method: "DELETE",
      })
    }
  } catch (error) {
    if (logErrors) {
      console.error("trainer session logout failed", error)
    }
  } finally {
    clearTrainerAccess()
  }
}
