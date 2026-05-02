export type BoxingAgeClass =
  | "Noch nicht wettkampffähig"
  | "Schüler U13"
  | "Kadetten U15"
  | "Junioren U17"
  | "Jugend U19"
  | "Männer/Frauen"
  | "Unbekannt"

export type BoxingAgeClassResult = {
  ageThisYear: number | null
  currentAge: number | null
  ageClass: BoxingAgeClass
  competitionEligibleNow: boolean
  note?: string
}

function parseBirthdateParts(birthdate: string | null) {
  if (!birthdate) return null

  const match = birthdate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null

  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    Number.isNaN(check.getTime()) ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

export function getBoxingAgeClass(birthdate: string | null, now: Date = new Date()): BoxingAgeClassResult {
  const parts = parseBirthdateParts(birthdate)
  if (!parts || Number.isNaN(now.getTime())) {
    return {
      ageThisYear: null,
      currentAge: null,
      ageClass: "Unbekannt",
      competitionEligibleNow: false,
    }
  }

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const currentDay = now.getDate()
  const ageThisYear = currentYear - parts.year

  const hadBirthdayThisYear =
    currentMonth > parts.month || (currentMonth === parts.month && currentDay >= parts.day)

  const currentAge = ageThisYear - (hadBirthdayThisYear ? 0 : 1)

  if (!Number.isFinite(ageThisYear) || !Number.isFinite(currentAge) || ageThisYear < 0 || currentAge < 0) {
    return {
      ageThisYear: null,
      currentAge: null,
      ageClass: "Unbekannt",
      competitionEligibleNow: false,
    }
  }

  const competitionEligibleNow = currentAge >= 10

  let ageClass: BoxingAgeClass = "Noch nicht wettkampffähig"
  if (ageThisYear >= 19) {
    ageClass = "Männer/Frauen"
  } else if (ageThisYear >= 17) {
    ageClass = "Jugend U19"
  } else if (ageThisYear >= 15) {
    ageClass = "Junioren U17"
  } else if (ageThisYear >= 13) {
    ageClass = "Kadetten U15"
  } else if (ageThisYear >= 10) {
    ageClass = "Schüler U13"
  }

  const note =
    ageClass === "Schüler U13" && !competitionEligibleNow
      ? "Wettkampf erst ab 10. Geburtstag"
      : undefined

  return {
    ageThisYear,
    currentAge,
    ageClass,
    competitionEligibleNow,
    note,
  }
}