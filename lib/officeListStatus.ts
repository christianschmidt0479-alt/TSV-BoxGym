export type OfficeListStatus = "green" | "yellow" | "red"

export type OfficeListResultStatus = OfficeListStatus | "gray"

export function isOfficeListStatus(value: string | null | undefined): value is OfficeListStatus {
  return value === "green" || value === "yellow" || value === "red"
}

export function getOfficeListStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "green":
      return "In aktueller Liste"
    case "yellow":
      return "Gefunden, Abweichung"
    case "red":
      return "Nicht in aktueller Liste"
    case "gray":
      return "Nur Excel"
    default:
      return "Kein Abgleich"
  }
}

export function getOfficeListStatusBadgeClass(status: string | null | undefined) {
  switch (status) {
    case "green":
      return "border-emerald-200 bg-emerald-100 text-emerald-800"
    case "yellow":
      return "border-amber-200 bg-amber-100 text-amber-800"
    case "red":
      return "border-red-200 bg-red-100 text-red-800"
    case "gray":
      return "border-zinc-300 bg-zinc-100 text-zinc-700"
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-700"
  }
}

export function getOfficeListStatusPanelClass(status: string | null | undefined) {
  switch (status) {
    case "green":
      return "rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
    case "yellow":
      return "rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
    case "red":
      return "rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    default:
      return "rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600"
  }
}

export function getOfficeListStatusMessage(status: string | null | undefined) {
  switch (status) {
    case "green":
      return "In aktueller Liste gefunden."
    case "yellow":
      return "In aktueller Liste gefunden, aber mit Abweichung."
    case "red":
      return "Nicht in aktueller Liste gefunden."
    default:
      return "Noch kein Geschäftsstelle-Abgleich durchgeführt."
  }
}