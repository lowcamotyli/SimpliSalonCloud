import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/get-auth-context';
import { logger } from '@/lib/logger';

interface BookingItem {
  serviceId: string;
  employeeId: string;
  startTime: string;
  addonIds?: string[];
}

interface CreateGroupBookingBody {
  clientId: string;
  salonId: string;
  items: BookingItem[];
  paymentMethod?: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  let groupIdToDelete: string | null = null;

  try {
    const { supabase, salonId: authSalonId } = await getAuthContext();
    const body: CreateGroupBookingBody = await request.json();

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ error: 'At least one booking item is required' }, { status: 400 });
    }

    // Check for within-request conflicts (same employee, overlapping times in the submitted items).
    // This runs before any DB insert so we don't rely on sequential DB visibility.
    for (let i = 0; i < body.items.length; i++) {
      const a = body.items[i];
      const aStart = new Date(a.startTime).getTime();
      for (let j = i + 1; j < body.items.length; j++) {
        const b = body.items[j];
        if (a.employeeId !== b.employeeId) continue;
        const bStart = new Date(b.startTime).getTime();
        // Without service durations yet, flag identical start times for the same employee.
        if (aStart === bStart) {
          return NextResponse.json({ error: 'conflict', conflictingItemIndex: j }, { status: 409 });
        }
      }
    }

    // Verify client belongs to the authenticated salon (prevent cross-tenant clientId injection)
    const { data: clientCheck, error: clientCheckError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', body.clientId)
      .eq('salon_id', authSalonId)
      .is('deleted_at', null)
      .single();

    if (clientCheckError || !clientCheck) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const { data: visitGroup, error: visitGroupError } = await supabase
      .from('visit_groups')
      .insert({ salon_id: authSalonId, client_id: body.clientId, payment_method: body.paymentMethod, notes: body.notes, status: 'confirmed' })
      .select('id')
      .single();

    if (visitGroupError || !visitGroup) {
      logger.error('[GROUP_BOOKINGS] Failed to create visit group', visitGroupError);
      return NextResponse.json({ error: 'Failed to create visit group' }, { status: 500 });
    }

    groupIdToDelete = visitGroup.id;

    // Fetch services upfront — needed for duration (NOT NULL) and totals
    const serviceIds = body.items.map(item => item.serviceId);
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('id, price, duration')
      .eq('salon_id', authSalonId)
      .in('id', serviceIds);

    if (servicesError || !services || services.length === 0) {
      throw new Error('Failed to fetch service details');
    }

    const serviceMap = new Map(services.map(s => [s.id, s]));
    const createdBookings = [];

    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i];
      const dt = new Date(item.startTime);
      const booking_date = dt.toISOString().slice(0, 10);
      const booking_time = dt.toTimeString().slice(0, 5);
      const svc = serviceMap.get(item.serviceId);
      const duration = svc?.duration ?? 0;
      const base_price = svc?.price ?? 0;
      const [newHour, newMinute] = booking_time.split(':').map(Number);
      const newStart = newHour * 60 + (newMinute || 0);
      const newEnd = newStart + duration;

      const { data: sameDayBookings, error: sameDayBookingsError } = await supabase
        .from('bookings')
        .select('booking_time, duration, status')
        .eq('salon_id', authSalonId)
        .eq('employee_id', item.employeeId)
        .eq('booking_date', booking_date)
        .is('deleted_at', null);

      if (sameDayBookingsError) {
        throw sameDayBookingsError;
      }

      const hasOverlap = (sameDayBookings || []).some((booking: any) => {
        if (booking.status === 'cancelled') return false;
        const [bHour, bMinute] = String(booking.booking_time).split(':').map(Number);
        const bStart = bHour * 60 + (bMinute || 0);
        const bEnd = bStart + Number(booking.duration || 0);
        return newStart < bEnd && newEnd > bStart;
      });

      if (hasOverlap) {
        throw new Error(`Conflict at index ${i}`);
      }

      const { data: newBooking, error: bookingError } = await supabase
        .from('bookings')
        .insert({ salon_id: authSalonId, client_id: body.clientId, service_id: item.serviceId, employee_id: item.employeeId, booking_date, booking_time, duration, base_price, visit_group_id: visitGroup.id, status: 'scheduled' } as any)
        .select()
        .single();

      if (bookingError) {
        logger.error(`[GROUP_BOOKINGS] Booking conflict on item ${i}`, bookingError);
        throw new Error(`Conflict at index ${i}`);
      }
      createdBookings.push(newBooking);
    }

    let totalPrice = 0;
    let totalDuration = 0;
    for (const item of body.items) {
      const service = serviceMap.get(item.serviceId);
      if (service) { totalPrice += service.price ?? 0; totalDuration += service.duration ?? 0; }
    }

    const { data: updatedVisitGroup, error: updateError } = await supabase
      .from('visit_groups')
      .update({ total_price: totalPrice, total_duration: totalDuration })
      .eq('id', visitGroup.id)
      .select()
      .single();

    if (updateError) throw new Error('Failed to finalize visit group');

    // TODO(INFRA-A-event-bus): emit('booking.group_created', { groupId: visitGroup.id })

    return NextResponse.json({ visitGroup: updatedVisitGroup, bookings: createdBookings }, { status: 201 });

  } catch (error: unknown) {
    if (groupIdToDelete) {
      try {
        const { supabase } = await getAuthContext()
        await supabase.from('bookings').delete().eq('visit_group_id', groupIdToDelete)
        await supabase.from('visit_groups').delete().eq('id', groupIdToDelete)
      } catch {}
    }
    if (error instanceof Error && error.message.startsWith('Conflict at index')) {
      const index = parseInt(error.message.split(' ')[3], 10);
      return NextResponse.json({ error: 'conflict', conflictingItemIndex: index }, { status: 409 });
    }
    const err = error as { name?: string };
    if (err.name === 'UnauthorizedError') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.name === 'NotFoundError') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    logger.error('[GROUP_BOOKINGS] Unexpected error in group booking', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
