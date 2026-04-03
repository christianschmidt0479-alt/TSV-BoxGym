type BirthdayMemberLike = {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  birthdate?: string | null
  base_group?: string | null
  is_trial?: boolean | null
  is_approved?: boolean | null
}

export type BirthdayEntry = {
  id: string
  display_name: string
  first_name: string | null
  last_name: string | null
  birthdate: string
  base_group: string | null
  is_trial: boolean
  is_approved: boolean
  occurrence_date: string
  turning_age: number
  is_today: boolean
  days_from_today: number
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_IN_MS = 24 * 60 * 60 * 1000

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function parseIsoDate(value?: string | null) {
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

  return { year, month, day }
}

function toUtcTimestamp(isoDate: string) {
  const parsed = parseIsoDate(isoDate)
  if (!parsed) return null
  return Date.UTC(parsed.year, parsed.month - 1, parsed.day)
}

function getBirthdayMonthDayForYear(birthdate: string, year: number) {
  const parsed = parseIsoDate(birthdate)
  if (!parsed) return null

  if (parsed.month === 2 && parsed.day === 29 && !isLeapYear(year)) {
    return { month: 2, day: 28 }
  }

  return { month: parsed.month, day: parsed.day }
}

export function getBirthdayDisplayName(member: Pick<BirthdayMemberLike, "name" | "first_name" | "last_name">) {
  const firstName = member.first_name?.trim() ?? ""
  const lastName = member.last_name?.trim() ?? ""
  const fullName = `${firstName} ${lastName}`.trim()
  return fullName || member.name?.trim() || "Unbekannt"
}

export function getBirthdayOccurrenceDate(birthdate: string, year: number) {
  const monthDay = getBirthdayMonthDayForYear(birthdate, year)
  if (!monthDay) return null
  return `${year}-${pad(monthDay.month)}-${pad(monthDay.day)}`
}

export function isBirthdayOnIsoDate(birthdate?: string | null, isoDate?: string | null) {
  if (!birthdate || !isoDate) return false

  const reference = parseIsoDate(isoDate)
  if (!reference) return false

  return getBirthdayOccurrenceDate(birthdate, reference.year) === isoDate
}

export function getTurningAgeOnIsoDate(birthdate?: string | null, isoDate?: string | null) {
  const birth = parseIsoDate(birthdate)
  const reference = parseIsoDate(isoDate)
  if (!birth || !reference) return null
  if (!isBirthdayOnIsoDate(birthdate, isoDate)) return null
  return reference.year - birth.year
}

export function getNextBirthdayEntry(member: BirthdayMemberLike, referenceDate: string) {
  const reference = parseIsoDate(referenceDate)
  const birthdate = member.birthdate?.trim()
  if (!reference || !birthdate) return null

  const thisYearBirthday = getBirthdayOccurrenceDate(birthdate, reference.year)
  if (!thisYearBirthday) return null

  const nextOccurrence = thisYearBirthday >= referenceDate ? thisYearBirthday : getBirthdayOccurrenceDate(birthdate, reference.year + 1)
  if (!nextOccurrence) return null

  return toBirthdayEntry(member, nextOccurrence, referenceDate)
}

export function getDaysBetweenIsoDates(fromIsoDate: string, toIsoDate: string) {
  const from = toUtcTimestamp(fromIsoDate)
  const to = toUtcTimestamp(toIsoDate)
  if (from === null || to === null) return null
  return Math.round((to - from) / DAY_IN_MS)
}

function compareBirthdayEntriesAscending(a: BirthdayEntry, b: BirthdayEntry) {
  return a.occurrence_date.localeCompare(b.occurrence_date) || a.display_name.localeCompare(b.display_name, "de")
}

function compareBirthdayEntriesDescending(a: BirthdayEntry, b: BirthdayEntry) {
  return b.occurrence_date.localeCompare(a.occurrence_date) || a.display_name.localeCompare(b.display_name, "de")
}

function toBirthdayEntry(member: BirthdayMemberLike, occurrenceDate: string, referenceDate: string): BirthdayEntry | null {
  const daysFromToday = getDaysBetweenIsoDates(referenceDate, occurrenceDate)
  if (daysFromToday === null) return null

  const occurrence = parseIsoDate(occurrenceDate)
  const birth = parseIsoDate(member.birthdate)
  if (!occurrence || !birth) return null

  return {
    id: member.id,
    display_name: getBirthdayDisplayName(member),
    first_name: member.first_name?.trim() || null,
    last_name: member.last_name?.trim() || null,
    birthdate: member.birthdate!,
    base_group: member.base_group?.trim() || null,
    is_trial: Boolean(member.is_trial),
    is_approved: Boolean(member.is_approved),
    occurrence_date: occurrenceDate,
    turning_age: occurrence.year - birth.year,
    is_today: daysFromToday === 0,
    days_from_today: daysFromToday,
  }
}

export function buildBirthdayOverview(members: BirthdayMemberLike[], referenceDate: string, limit = 5) {
  const reference = parseIsoDate(referenceDate)
  if (!reference) {
    return {
      todayBirthdays: [] as BirthdayEntry[],
      upcomingBirthdays: [] as BirthdayEntry[],
      recentBirthdays: [] as BirthdayEntry[],
    }
  }

  const upcomingBirthdays: BirthdayEntry[] = []
  const recentBirthdays: BirthdayEntry[] = []

  for (const member of members) {
    const birthdate = member.birthdate?.trim()
    if (!birthdate) continue

    const thisYearBirthday = getBirthdayOccurrenceDate(birthdate, reference.year)
    if (!thisYearBirthday) continue

    const nextOccurrence = thisYearBirthday >= referenceDate ? thisYearBirthday : getBirthdayOccurrenceDate(birthdate, reference.year + 1)
    const previousOccurrence =
      thisYearBirthday < referenceDate ? thisYearBirthday : getBirthdayOccurrenceDate(birthdate, reference.year - 1)

    if (nextOccurrence) {
      const entry = toBirthdayEntry(member, nextOccurrence, referenceDate)
      if (entry) upcomingBirthdays.push(entry)
    }

    if (previousOccurrence) {
      const entry = toBirthdayEntry(member, previousOccurrence, referenceDate)
      if (entry) recentBirthdays.push(entry)
    }
  }

  upcomingBirthdays.sort(compareBirthdayEntriesAscending)
  recentBirthdays.sort(compareBirthdayEntriesDescending)

  return {
    todayBirthdays: upcomingBirthdays.filter((entry) => entry.is_today),
    upcomingBirthdays: upcomingBirthdays.slice(0, limit),
    recentBirthdays: recentBirthdays.slice(0, limit),
  }
}