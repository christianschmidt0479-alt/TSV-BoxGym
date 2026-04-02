export const CHECKIN_WINDOW_MINUTES = 30

type SessionWithStart = {
  start: string
}

export function parseTimeToDate(time: string, referenceDate: Date) {
  const [hours, minutes] = time.split(":").map(Number)
  const parsed = new Date(referenceDate)
  parsed.setHours(hours, minutes, 0, 0)
  return parsed
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