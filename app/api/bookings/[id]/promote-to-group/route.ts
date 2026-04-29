import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/get-auth-context';
import { logger } from '@/lib/logger';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;
    const { supabase, salonId: authSalonId } = await getAuthContext();

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, client_id, salon_id, status, payment_method, total_price, duration, visit_group_id')
      .eq('id', bookingId)
      .eq('salon_id', authSalonId)
      .single();

    if (bookingError) {
      if (bookingError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }

      logger.error('[PROMOTE_BOOKING_TO_GROUP] booking fetch failed', bookingError);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.visit_group_id !== null) {
      return NextResponse.json({ groupId: booking.visit_group_id }, { status: 200 });
    }

    const { data: group, error: groupError } = await supabase
      .from('visit_groups')
      .insert({
        client_id: booking.client_id,
        salon_id: authSalonId,
        status: 'confirmed',
        payment_method: booking.payment_method ?? null,
        total_price: booking.total_price,
        total_duration: booking.duration,
      })
      .select('id')
      .single();

    if (groupError || !group) {
      logger.error('[PROMOTE_BOOKING_TO_GROUP] visit group insert failed', groupError);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({ visit_group_id: group.id })
      .eq('id', bookingId)
      .eq('salon_id', authSalonId)
      .select('id')
      .single();

    if (updateError || !updatedBooking) {
      logger.error('[PROMOTE_BOOKING_TO_GROUP] booking update failed', updateError);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    return NextResponse.json({ groupId: group.id }, { status: 200 });
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (err.name === 'NotFoundError') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    logger.error('[PROMOTE_BOOKING_TO_GROUP] unexpected error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
