import { addDaysToIsoDate, getZonedParts, zonedDateTimeToUtcIso } from '@/lib/utils/timezone'

export interface EquipmentUtcBlock {
  starts_at: string
  ends_at: string
}

export function buildSalonDayUtcRange(date: string, timeZone: string): { startIso: string; endIso: string } {
  return {
    startIso: zonedDateTimeToUtcIso(date, '00:00', timeZone),
    endIso: zonedDateTimeToUtcIso(addDaysToIsoDate(date, 1), '00:00', timeZone),
  }
}

export function buildSalonDateRangeUtc(
  startDate: string,
  endDate: string,
  timeZone: string
): { startIso: string; endExclusiveIso: string } {
  return {
    startIso: zonedDateTimeToUtcIso(startDate, '00:00', timeZone),
    endExclusiveIso: zonedDateTimeToUtcIso(addDaysToIsoDate(endDate, 1), '00:00', timeZone),
  }
}

export function buildSalonSlotUtcRange(
  date: string,
  time: string,
  durationMinutes: number,
  timeZone: string
): { startsAtIso: string; endsAtIso: string } {
  const startsAtIso = zonedDateTimeToUtcIso(date, time, timeZone)
  const endsAtIso = new Date(new Date(startsAtIso).getTime() + durationMinutes * 60_000).toISOString()
  return { startsAtIso, endsAtIso }
}

export function toSalonLocalMinuteBlock(
  block: EquipmentUtcBlock,
  timeZone: string,
  targetDate: string
): [number, number] | null {
  const startsAt = new Date(block.starts_at)
  const endsAt = new Date(block.ends_at)

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return null
  }

  const zonedStart = getZonedParts(startsAt, timeZone)
  const zonedEnd = getZonedParts(endsAt, timeZone)

  if (zonedEnd.date < targetDate || zonedStart.date > targetDate) {
    return null
  }

  const startMinutes = zonedStart.date < targetDate ? 0 : zonedStart.hour * 60 + zonedStart.minute
  const endMinutes = zonedEnd.date > targetDate ? 24 * 60 : zonedEnd.hour * 60 + zonedEnd.minute

  if (endMinutes <= startMinutes) {
    return null
  }

  return [startMinutes, endMinutes]
}
