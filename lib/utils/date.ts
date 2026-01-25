import { format, parseISO, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { pl } from 'date-fns/locale'

export const DATE_FORMAT = 'yyyy-MM-dd'
export const TIME_FORMAT = 'HH:mm'
export const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss'

export function formatDate(date: Date | string, formatString: string = DATE_FORMAT): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, formatString, { locale: pl })
}

export function formatTime(time: Date | string): string {
  if (typeof time === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    return time.substring(0, 5) // HH:mm
  }
  const d = typeof time === 'string' ? parseISO(time) : time
  return format(d, TIME_FORMAT)
}

export function parseDate(dateString: string): Date {
  return parseISO(dateString)
}

export function getCurrentWeek(date: Date = new Date()) {
  return {
    start: startOfWeek(date, { weekStartsOn: 1 }), // Monday
    end: endOfWeek(date, { weekStartsOn: 1 })
  }
}

export function getCurrentMonth(date: Date = new Date()) {
  return {
    start: startOfMonth(date),
    end: endOfMonth(date)
  }
}

export function generateWeekDays(startDate: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startDate, i))
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}