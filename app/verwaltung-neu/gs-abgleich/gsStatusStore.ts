export type TsvStatus = "match" | "mismatch" | "not_found"

const STORAGE_KEY = "tsv_gs_status_map_v1"

export function saveGsStatusMap(statusMap: Record<string, TsvStatus>) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap))
}

export function loadGsStatusMap(): Record<string, TsvStatus> {
  if (typeof window === "undefined") return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: Record<string, TsvStatus> = {}

    for (const [memberId, value] of Object.entries(parsed)) {
      if (value === "match" || value === "mismatch" || value === "not_found") {
        next[memberId] = value
      }
    }

    return next
  } catch {
    return {}
  }
}
