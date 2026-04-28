

export type GsStatus = "match" | "mismatch" | "not_found"

export interface GsStatusEntry {
  status: GsStatus
  groupName: string
  checkedAt: string // ISO
}

const STORAGE_KEY = "tsv_gs_status_map_v2"

// statusMap: Record<memberId, GsStatus>
// groupName: string
export function saveGsStatusMapForGroup(
  groupName: string,
  statusMap: Record<string, GsStatus>
) {
  if (typeof window === "undefined") return
  const now = new Date().toISOString()
  // Alte Struktur laden und migrieren
  const prev = loadGsStatusMapRaw()
  // Für diese Gruppe überschreiben, andere Gruppen erhalten
  for (const [memberId, status] of Object.entries(statusMap)) {
    prev[memberId] = {
      status,
      groupName,
      checkedAt: now,
    }
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prev))
}


// Rohdaten-Lader für Migration
function loadGsStatusMapRaw(): Record<string, GsStatusEntry> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, any>
    const next: Record<string, GsStatusEntry> = {}
    for (const [memberId, value] of Object.entries(parsed)) {
      if (
        value && typeof value === "object" &&
        (value.status === "match" || value.status === "mismatch" || value.status === "not_found") &&
        typeof value.groupName === "string" &&
        typeof value.checkedAt === "string"
      ) {
        next[memberId] = value as GsStatusEntry
      } else if (value === "match" || value === "mismatch" || value === "not_found") {
        // Migration: alte Struktur
        next[memberId] = {
          status: value,
          groupName: "(unbekannt)",
          checkedAt: "",
        }
      }
    }
    return next
  } catch {
    return {}
  }
}

// Für UI: alle Status laden
export function loadGsStatusMap(): Record<string, GsStatusEntry> {
  return loadGsStatusMapRaw()
}
