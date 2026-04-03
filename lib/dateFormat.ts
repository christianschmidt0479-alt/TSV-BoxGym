type DisplayDateOptions = {
  timeZone?: string
}

type DisplayWeekdayOptions = DisplayDateOptions & {
  weekday?: "long" | "short" | "narrow"
}

const GERMAN_DATE_PATTERN = /^\d{2}\.\d{2}\.\d{4}$/
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function formatDisplayDate(date: Date, options: DisplayDateOptions = {}) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date)
}

export function formatDisplayDateTime(date: Date, options: DisplayDateOptions = {}) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date)
}

export function formatDisplayWeekday(date: Date, options: DisplayWeekdayOptions = {}) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: options.weekday ?? "long",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date)
}

export function formatIsoDateForDisplay(value: string | null | undefined) {
  const trimmedValue = value?.trim()
  if (!trimmedValue) return null

  const match = trimmedValue.match(ISO_DATE_PATTERN)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return formatDisplayDate(date, { timeZone: "UTC" })
}

export function formatDateInputForDisplay(value: string | null | undefined) {
  const trimmedValue = value?.trim()
  if (!trimmedValue) return null
  if (GERMAN_DATE_PATTERN.test(trimmedValue)) return trimmedValue

  const isoFormattedValue = formatIsoDateForDisplay(trimmedValue)
  if (isoFormattedValue) return isoFormattedValue

  const parsed = new Date(trimmedValue)
  if (Number.isNaN(parsed.getTime())) return null

  return formatDisplayDate(parsed, { timeZone: "UTC" })
}