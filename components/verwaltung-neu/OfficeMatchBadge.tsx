type OfficeStatus = "green" | "yellow" | "red" | null

type OfficeMatchBadgeProps = {
  status?: string | null
  baseGroup?: string | null
  officeGroup?: string | null
  checkedAt?: string | null
  compact?: boolean
}

function normalizeOfficeStatus(status?: string | null): OfficeStatus {
  if (status === "green" || status === "yellow" || status === "red") return status
  return null
}

function statusMeta(status?: string | null) {
  const normalized = normalizeOfficeStatus(status)

  if (normalized === "green") {
    return {
      dot: "bg-emerald-500",
      bg: "bg-emerald-50",
      text: "text-emerald-800",
      label: "Geschäftsstelle: passt",
      shortLabel: "GS passt",
    }
  }
  if (normalized === "yellow") {
    return {
      dot: "bg-amber-400",
      bg: "bg-amber-50",
      text: "text-amber-900",
      label: "Geschäftsstelle: Abweichung",
      shortLabel: "GS Abweichung",
    }
  }
  if (normalized === "red") {
    return {
      dot: "bg-red-500",
      bg: "bg-red-50",
      text: "text-red-800",
      label: "Geschäftsstelle: nicht gefunden / prüfen",
      shortLabel: "GS prüfen",
    }
  }

  return {
    dot: "bg-zinc-400",
    bg: "bg-zinc-100",
    text: "text-zinc-700",
    label: "Geschäftsstelle: noch nicht geprüft",
    shortLabel: "GS offen",
  }
}

function formatCheckedAt(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

function isLGroup(baseGroup?: string | null) {
  return (baseGroup ?? "").trim().toLowerCase() === "l-gruppe"
}

export function OfficeMatchBadge({ status, baseGroup, officeGroup, checkedAt, compact = false }: OfficeMatchBadgeProps) {
  const meta = statusMeta(status)
  const lGroupHint = isLGroup(baseGroup)
    ? "L-Gruppe: Abgleich über Stamm-/Office-Gruppe prüfen."
    : null

  const tooltipParts = [
    meta.label,
    `Office-Gruppe: ${officeGroup || "-"}`,
    `Geprüft am: ${formatCheckedAt(checkedAt)}`,
    lGroupHint,
  ].filter(Boolean)

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-zinc-300 px-2 py-1 text-[11px] font-bold leading-none ${compact ? "bg-white text-zinc-700" : `${meta.bg} ${meta.text}`}`}
      title={tooltipParts.join("\n")}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      <span>{compact ? "GS" : meta.shortLabel}</span>
    </span>
  )
}

export function OfficeMatchLegend() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-700 shadow-sm">
      <div className="mb-2 font-semibold text-zinc-900">GS-/Office-Abgleich</div>
      <div className="flex flex-wrap items-center gap-2">
        <OfficeMatchBadge status="green" compact />
        <OfficeMatchBadge status="yellow" compact />
        <OfficeMatchBadge status="red" compact />
        <OfficeMatchBadge status={null} compact />
      </div>
      <div className="mt-2 text-zinc-600">L-Gruppe wird über die Stamm-/Office-Gruppe geprüft.</div>
    </div>
  )
}

export function getOfficeMatchText(status?: string | null) {
  return statusMeta(status).label
}

export function getOfficeCheckedAtText(value?: string | null) {
  return formatCheckedAt(value)
}