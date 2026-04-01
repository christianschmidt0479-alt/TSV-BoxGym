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
  return emptyRememberedMemberDevice
}

export function persistRememberedMemberDevice(payload: RememberedMemberDevice) {
  void payload
}

export function clearRememberedMemberDevice() {
  return
}
