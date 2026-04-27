import { resolveSalonTimeZone, zonedDateTimeToUtcIso } from '@/lib/utils/timezone'

type SupabaseLike = {
  from: (table: string) => any
}

export type TimeReservationConflict = {
  id: string
  title: string | null
  start_at: string
  end_at: string
}

export async function getSalonTimeZoneForBookings(
  supabase: SupabaseLike,
  salonId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('salon_settings')
    .select('timezone')
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error) throw error
  return resolveSalonTimeZone(data?.timezone ?? null)
}

export async function findTimeReservationConflict({
  supabase,
  salonId,
  employeeId,
  date,
  startTime,
  durationMinutes,
  timeZone,
}: {
  supabase: SupabaseLike
  salonId: string
  employeeId: string
  date: string
  startTime: string
  durationMinutes: number
  timeZone?: string
}): Promise<TimeReservationConflict | null> {
  if (!employeeId || !date || !startTime || durationMinutes <= 0) return null

  const salonTimeZone = timeZone ?? await getSalonTimeZoneForBookings(supabase, salonId)
  const startAtIso = zonedDateTimeToUtcIso(date, startTime.slice(0, 5), salonTimeZone)
  const endAtIso = new Date(new Date(startAtIso).getTime() + durationMinutes * 60_000).toISOString()

  const { data, error } = await supabase
    .from('time_reservations')
    .select('id, title, start_at, end_at')
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)
    .lt('start_at', endAtIso)
    .gt('end_at', startAtIso)
    .limit(1)

  if (error) throw error
  return (data?.[0] as TimeReservationConflict | undefined) ?? null
}

export function formatTimeReservationConflictMessage(conflict: TimeReservationConflict): string {
  const title = conflict.title?.trim()
  return title
    ? `Pracownik ma zarezerwowany czas: ${title}.`
    : 'Pracownik ma zarezerwowany czas w tym terminie.'
}
