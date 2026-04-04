export const CHECKIN_WINDOW_MINUTES = 30

const BERLIN_TIME_ZONE = "Europe/Berlin"

type SessionWithStart = {
  start: string
}

function getTimeZoneParts(referenceDate: Date, timeZone = BERLIN_TIME_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(referenceDate).map((part) => [part.type, part.value])
  )

  return {
    year: Number(parts.year ?? 0),
    month: Number(parts.month ?? 0),
    day: Number(parts.day ?? 0),
    hour: Number(parts.hour ?? 0),
    minute: Number(parts.minute ?? 0),
    second: Number(parts.second ?? 0),
  }
}

export function parseTimeToDate(time: string, referenceDate: Date) {
  const [hours, minutes] = time.split(":").map(Number)
  const berlinParts = getTimeZoneParts(referenceDate)
  const berlinReferenceUtc = Date.UTC(
    berlinParts.year,
    berlinParts.month - 1,
    berlinParts.day,
    berlinParts.hour,
    berlinParts.minute,
    berlinParts.second,
    0
  )
  const timeZoneOffsetMs = berlinReferenceUtc - referenceDate.getTime()

  return new Date(
    Date.UTC(berlinParts.year, berlinParts.month - 1, berlinParts.day, hours, minutes, 0, 0) - timeZoneOffsetMs
  )
}

export function getSessionCheckinWindow<T extends SessionWithStart>(session: T, referenceDate: Date) {
  const startDate = parseTimeToDate(session.start, referenceDate)
  const offsetMs = CHECKIN_WINDOW_MINUTES * 60 * 1000

  return {
    windowStart: new Date(startDate.getTime() - offsetMs),
    windowEnd: new Date(startDate.getTime() + offsetMs),
  }
}

export function isSessionOpenForCheckin<T extends SessionWithStart>(session: T, referenceDate: Date) {
  const { windowStart, windowEnd } = getSessionCheckinWindow(session, referenceDate)
  const now = referenceDate.getTime()
  return now >= windowStart.getTime() && now <= windowEnd.getTime()
}

export function getActiveCheckinSession<T extends SessionWithStart>(referenceDate: Date, dailySessions: T[]) {
  const sessionsWithWindow = dailySessions
    .map((session) => ({
      session,
      ...getSessionCheckinWindow(session, referenceDate),
    }))
    .sort((left, right) => left.windowStart.getTime() - right.windowStart.getTime())

  return sessionsWithWindow.find(({ windowStart, windowEnd }) => {
    const now = referenceDate.getTime()
    return now >= windowStart.getTime() && now <= windowEnd.getTime()
  })?.session ?? null
}