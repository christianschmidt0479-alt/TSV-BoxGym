import {
  getQrAccessExpiryStorageKey,
  getQrAccessTokenStorageKey,
  QR_ACCESS_HEADER,
  type QrAccessPanel,
} from "@/lib/qrAccess"

type StoredQrAccess = {
  token: string
  accessUntil: number
}

function isBrowser() {
  return typeof window !== "undefined"
}

export function readStoredQrAccess(panel: QrAccessPanel): StoredQrAccess | null {
  if (!isBrowser()) return null

  const token = window.localStorage.getItem(getQrAccessTokenStorageKey(panel)) || ""
  const accessUntilRaw = window.localStorage.getItem(getQrAccessExpiryStorageKey(panel)) || "0"
  const accessUntil = Number(accessUntilRaw)

  if (!token || !Number.isFinite(accessUntil) || accessUntil <= Date.now()) {
    clearStoredQrAccess(panel)
    return null
  }

  return { token, accessUntil }
}

export function storeQrAccess(panel: QrAccessPanel, token: string, accessUntil: number) {
  if (!isBrowser()) return

  window.localStorage.setItem(getQrAccessTokenStorageKey(panel), token)
  window.localStorage.setItem(getQrAccessExpiryStorageKey(panel), String(accessUntil))
}

export function clearStoredQrAccess(panel: QrAccessPanel) {
  if (!isBrowser()) return

  window.localStorage.removeItem(getQrAccessTokenStorageKey(panel))
  window.localStorage.removeItem(getQrAccessExpiryStorageKey(panel))
}

export function buildQrAccessHeaders(token: string) {
  const headers: Record<string, string> = {}
  if (!token) return headers

  headers[QR_ACCESS_HEADER] = token
  return headers
}