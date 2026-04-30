type DisplayDateOptions = {
  timeZone?: string
}

type DisplayWeekdayOptions = DisplayDateOptions & {
  weekday?: "long" | "short" | "narrow"
}

const GERMAN_DATE_PATTERN = /^\d{2}\.\d{2}\.\d{4}$/
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const DEFAULT_TIME_ZONE = "Europe/Berlin"

function parseGmtOffsetToMilliseconds(value: string) {
  const normalizedValue = value.trim()
  if (normalizedValue === "GMT" || normalizedValue === "UTC") {
    return 0
  }

  const match = normalizedValue.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) {
    throw new Error(`Unsupported GMT offset: ${value}`)
  }

  const sign = match[1] === "+" ? 1 : -1
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? "0")

  return sign * ((hours * 60) + minutes) * 60 * 1000
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })

  const offsetValue = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value
  if (!offsetValue) {
    throw new Error(`Missing time zone offset for ${timeZone}`)
  }

  return parseGmtOffsetToMilliseconds(offsetValue)
}

function createUtcDateForTimeZoneLocalTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string,
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond))
  const firstOffset = getTimeZoneOffsetMilliseconds(utcGuess, timeZone)
  const firstCandidate = new Date(utcGuess.getTime() - firstOffset)
  const secondOffset = getTimeZoneOffsetMilliseconds(firstCandidate, timeZone)

  if (firstOffset === secondOffset) {
    return firstCandidate
  }

  return new Date(utcGuess.getTime() - secondOffset)
}

export function formatDisplayDate(date: Date, options: DisplayDateOptions = {}) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
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
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(date)
}

export function formatDisplayWeekday(date: Date, options: DisplayWeekdayOptions = {}) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: options.weekday ?? "long",
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
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

export function getIsoDateInTimeZone(date = new Date(), timeZone = "Europe/Berlin") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value])
  )

  return `${parts.year ?? ""}-${parts.month ?? ""}-${parts.day ?? ""}`
}

export function getTodayIsoDateInBerlin(date = new Date()) {
  return getIsoDateInTimeZone(date, "Europe/Berlin")
}

export function getBerlinDayRangeUtc(date = new Date()) {
  const isoDate = getIsoDateInTimeZone(date, DEFAULT_TIME_ZONE)
  const [year, month, day] = isoDate.split("-").map(Number)

  const start = createUtcDateForTimeZoneLocalTime(year, month, day, 0, 0, 0, 0, DEFAULT_TIME_ZONE)
  const end = createUtcDateForTimeZoneLocalTime(year, month, day, 23, 59, 59, 999, DEFAULT_TIME_ZONE)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

export function isTodayCheckinInBerlin(
  row: { date?: string | null; created_at?: string | null },
  todayIsoDate = getTodayIsoDateInBerlin()
) {
  if (row.date?.trim() === todayIsoDate) {
    return true
  }

  if (!row.created_at) {
    return false
  }

  const createdAt = new Date(row.created_at)
  if (Number.isNaN(createdAt.getTime())) {
    return false
  }

  return getIsoDateInTimeZone(createdAt, "Europe/Berlin") === todayIsoDate
}