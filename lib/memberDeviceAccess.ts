"use client"

export const MEMBER_DEVICE_STORAGE_KEY = "tsv_member_device_checkin"

export type RememberedMemberDevice = {
  token: string
  memberId: string
  firstName: string
  lastName: string
  isCompetitionMember: boolean
  rememberUntil: number
}

const emptyRememberedMemberDevice: RememberedMemberDevice = {
  token: "",
  memberId: "",
  firstName: "",
  lastName: "",
  isCompetitionMember: false,
  rememberUntil: 0,
}

export function readRememberedMemberDevice() {
  if (typeof window === "undefined") return emptyRememberedMemberDevice

  try {
    const raw = window.localStorage.getItem(MEMBER_DEVICE_STORAGE_KEY)
    if (!raw) return emptyRememberedMemberDevice

    const parsed = JSON.parse(raw) as Partial<RememberedMemberDevice>
    const rememberUntil = Number(parsed.rememberUntil ?? 0)

    if (!parsed.token || !parsed.memberId || !parsed.firstName || !parsed.lastName || !rememberUntil || rememberUntil <= Date.now()) {
      window.localStorage.removeItem(MEMBER_DEVICE_STORAGE_KEY)
      return emptyRememberedMemberDevice
    }

    return {
      token: String(parsed.token),
      memberId: String(parsed.memberId),
      firstName: String(parsed.firstName),
      lastName: String(parsed.lastName),
      isCompetitionMember: Boolean(parsed.isCompetitionMember),
      rememberUntil,
    }
  } catch {
    return emptyRememberedMemberDevice
  }
}

export function persistRememberedMemberDevice(payload: RememberedMemberDevice) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(MEMBER_DEVICE_STORAGE_KEY, JSON.stringify(payload))
}

export function clearRememberedMemberDevice() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(MEMBER_DEVICE_STORAGE_KEY)
}
