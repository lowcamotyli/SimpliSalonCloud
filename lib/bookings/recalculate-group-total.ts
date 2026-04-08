import { createServerSupabaseClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export async function recalculateGroupTotal(supabase: SupabaseClient, visitGroupId: string): Promise<number> {
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, base_price, duration')
    .eq('visit_group_id', visitGroupId)
    .is('deleted_at', null)

  if (bookingsError) {
    throw bookingsError
  }

  const bookingRows = bookings ?? []
  const bookingIds = bookingRows.map((booking) => booking.id)

  let addonsByBooking = new Map<string, number>()

  if (bookingIds.length > 0) {
    const { data: bookingAddons, error: addonsError } = await supabase
      .from('booking_addons')
      .select('booking_id, price_at_booking')
      .in('booking_id', bookingIds)

    if (addonsError) {
      throw addonsError
    }

    addonsByBooking = (bookingAddons ?? []).reduce((map, addon) => {
      const current = map.get(addon.booking_id) ?? 0
      map.set(addon.booking_id, current + (Number(addon.price_at_booking) || 0))
      return map
    }, new Map<string, number>())
  }

  const totalPrice = bookingRows.reduce((sum, booking) => {
    const base = Number(booking.base_price) || 0
    const addons = addonsByBooking.get(booking.id) ?? 0
    return sum + base + addons
  }, 0)

  const totalDuration = bookingRows.reduce((sum, booking) => sum + (Number(booking.duration) || 0), 0)

  const { error: updateError } = await supabase
    .from('visit_groups')
    .update({
      total_price: totalPrice,
      total_duration: totalDuration,
    })
    .eq('id', visitGroupId)

  if (updateError) {
    throw updateError
  }

  return totalPrice
}
