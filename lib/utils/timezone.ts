const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

export const DEFAULT_TIMEZONE = 'UTC'

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  date: string
}

function parseDateString(date: string): { year: number; month: number; day: number } {
  if (!DATE_RE.test(date)) {
    throw new Error('Date must use YYYY-MM-DD format')
  }

  const [yearRaw, monthRaw, dayRaw] = date.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error('Date must use YYYY-MM-DD format')
  }
  return { year, month, day }
}

function parseTimeString(time: string): { hour: number; minute: number } {
  if (!TIME_RE.test(time)) {
    throw new Error('Time must use HH:mm format')
  }

  const [hourRaw, minuteRaw] = time.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Time must use HH:mm format')
  }
  return { hour, minute }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function resolveSalonTimeZone(timeZone: string | null | undefined): string {
  if (typeof timeZone !== 'string' || timeZone.trim().length === 0) {
    return DEFAULT_TIMEZONE
  }
  const normalized = timeZone.trim()
  return isValidTimeZone(normalized) ? normalized : DEFAULT_TIMEZONE
}

export function getZonedParts(value: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const parts = formatter.formatToParts(value)
  const pick = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? ''

  const year = Number(pick('year'))
  const month = Number(pick('month'))
  const day = Number(pick('day'))
  const hour = Number(pick('hour'))
  const minute = Number(pick('minute'))

  return {
    year,
    month,
    day,
    hour,
    minute,
    date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

export function getDayOfWeekFromIsoDate(date: string): number {
  const { year, month, day } = parseDateString(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function addDaysToIsoDate(date: string, days: number): string {
  const { year, month, day } = parseDateString(date)
  const value = new Date(Date.UTC(year, month - 1, day))
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function zonedDateTimeToUtcIso(date: string, time: string, timeZone: string): string {
  const { year, month, day } = parseDateString(date)
  const { hour, minute } = parseTimeString(time)
  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  let guessUtcMs = targetUtcMs

  for (let i = 0; i < 6; i += 1) {
    const zoned = getZonedParts(new Date(guessUtcMs), timeZone)
    const projectedUtcMs = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, 0, 0)
    const diff = targetUtcMs - projectedUtcMs
    guessUtcMs += diff
    if (diff === 0) break
  }

  const final = getZonedParts(new Date(guessUtcMs), timeZone)
  if (final.date !== date || final.hour !== hour || final.minute !== minute) {
    throw new Error('Provided local datetime is invalid for selected timezone')
  }

  return new Date(guessUtcMs).toISOString()
}
