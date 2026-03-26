"use client"

import { useSyncExternalStore } from "react"
import { TRAINER_ACCESS_EVENT, readTrainerAccess, type TrainerRole } from "@/lib/trainerAccess"

type TrainerAccessSnapshot = {
  resolved: boolean
  role: TrainerRole
  accountRole: TrainerRole
  linkedMemberId: string | null
  accountEmail: string
}

const SERVER_SNAPSHOT: TrainerAccessSnapshot = { resolved: false, role: "", accountRole: "", linkedMemberId: null, accountEmail: "" }
const EMPTY_SNAPSHOT: TrainerAccessSnapshot = { resolved: true, role: "", accountRole: "", linkedMemberId: null, accountEmail: "" }
let cachedSnapshot: TrainerAccessSnapshot = EMPTY_SNAPSHOT

function getSnapshot(): TrainerAccessSnapshot {
  if (typeof window === "undefined") {
    return SERVER_SNAPSHOT
  }

  const { role, accountRole, linkedMemberId, accountEmail } = readTrainerAccess()
  if (!role) {
    cachedSnapshot = EMPTY_SNAPSHOT
    return cachedSnapshot
  }

  if (
    cachedSnapshot.resolved &&
    cachedSnapshot.role === role &&
    cachedSnapshot.accountRole === accountRole &&
    cachedSnapshot.linkedMemberId === linkedMemberId &&
    cachedSnapshot.accountEmail === accountEmail
  ) {
    return cachedSnapshot
  }

  cachedSnapshot = { resolved: true, role, accountRole, linkedMemberId, accountEmail }
  return cachedSnapshot
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const listener = () => callback()
  window.addEventListener("storage", listener)
  window.addEventListener("focus", listener)
  window.addEventListener(TRAINER_ACCESS_EVENT, listener)
  window.addEventListener("pageshow", listener)

  return () => {
    window.removeEventListener("storage", listener)
    window.removeEventListener("focus", listener)
    window.removeEventListener(TRAINER_ACCESS_EVENT, listener)
    window.removeEventListener("pageshow", listener)
  }
}

export function useTrainerAccess() {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT)
}
