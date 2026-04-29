import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/get-auth-context';
import { logger } from '@/lib/logger';
import { canEmployeePerformService } from '@/lib/bookings/employee-service-authorization';
import { findTimeReservationConflict, formatTimeReservationConflictMessage, getSalonTimeZoneForBookings } from '@/lib/bookings/time-reservation-conflicts';

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
  forceOverride?: boolean;
  force_override?: boolean;
  paymentMethod?: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, salonId: authSalonId } = await getAuthContext();
    const body: CreateGroupBookingBody = await request.json();
    const forceOverride = body.forceOverride === true || body.force_override === true;

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ error: 'At least one booking item is required' }, { status: 400 });
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

    // Fetch services upfront — needed for duration and base_price in RPC payload
    const serviceIds = body.items.map(item => item.serviceId);
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('id, price, duration')
      .eq('salon_id', authSalonId)
      .in('id', serviceIds);

    if (servicesError || !services || services.length === 0) {
      throw new Error('Failed to fetch service details');
    }

    const authorizationResults = await Promise.all(
      body.items.map((item) =>
        canEmployeePerformService(supabase as any, authSalonId, item.employeeId, item.serviceId)
      )
    );

    if (authorizationResults.some((canPerformService) => !canPerformService)) {
      return NextResponse.json(
        { error: 'Employee is not authorized to perform this service' },
        { status: 400 }
      );
    }

    const serviceMap = new Map(services.map(s => [s.id, s]));
    const rpcItems = body.items.map(item => {
      const dt = new Date(item.startTime);
      const svc = serviceMap.get(item.serviceId);
      return {
        service_id: item.serviceId,
        employee_id: item.employeeId,
        booking_date: dt.toISOString().slice(0, 10),
        booking_time: String(dt.getUTCHours()).padStart(2, '0') + ':' + String(dt.getUTCMinutes()).padStart(2, '0'),
        duration: svc?.duration ?? 0,
        base_price: svc?.price ?? 0,
      };
    });

    if (!forceOverride) {
      const salonTimeZone = await getSalonTimeZoneForBookings(supabase as any, authSalonId);

      for (let index = 0; index < rpcItems.length; index += 1) {
        const item = rpcItems[index];
        const conflict = await findTimeReservationConflict({
          supabase: supabase as any,
          salonId: authSalonId,
          employeeId: item.employee_id,
          date: item.booking_date,
          startTime: item.booking_time,
          durationMinutes: Number(item.duration) || 0,
          timeZone: salonTimeZone,
        });

        if (conflict) {
          return NextResponse.json({
            error: 'TIME_RESERVATION_CONFLICT',
            message: formatTimeReservationConflictMessage(conflict),
            conflictingItemIndex: index,
          }, { status: 409 });
        }
      }
    }

    let result: any;

    if (forceOverride) {
      const totalPrice = rpcItems.reduce((sum, item) => sum + (Number(item.base_price) || 0), 0);
      const totalDuration = rpcItems.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);

      const { data: visitGroup, error: visitGroupError } = await supabase
        .from('visit_groups')
        .insert({
          salon_id: authSalonId,
          client_id: body.clientId,
          payment_method: body.paymentMethod ?? null,
          notes: body.notes ?? null,
          status: 'confirmed',
          total_price: totalPrice,
          total_duration: totalDuration,
        })
        .select('id')
        .single();

      if (visitGroupError || !visitGroup) {
        logger.error('[GROUP_BOOKINGS] force override visit group insert failed', visitGroupError);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
      }

      const bookingRows = rpcItems.map((item) => ({
        salon_id: authSalonId,
        client_id: body.clientId,
        service_id: item.service_id,
        employee_id: item.employee_id,
        booking_date: item.booking_date,
        booking_time: item.booking_time,
        duration: item.duration,
        base_price: item.base_price,
        visit_group_id: visitGroup.id,
        status: 'scheduled',
      }));

      const { data: createdBookings, error: bookingsError } = await supabase
        .from('bookings')
        .insert(bookingRows)
        .select('id');

      if (bookingsError || !createdBookings) {
        logger.error('[GROUP_BOOKINGS] force override booking insert failed', bookingsError);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
      }

      result = { visit_group_id: visitGroup.id, bookings: createdBookings };
    } else {
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        'create_group_booking_atomic',
        {
          p_salon_id: authSalonId,
          p_client_id: body.clientId,
          p_payment_method: body.paymentMethod ?? null,
          p_notes: body.notes ?? null,
          p_items: rpcItems,
          p_terms_accepted_at: null,
        }
      );

      if (rpcError) {
        if (rpcError.code === '23P01') {
          const detail: string = rpcError.details ?? rpcError.detail ?? '';
          const itemMatch = detail.match(/item[s]?\s+(\d+)/);
          const conflictingItemIndex = itemMatch ? parseInt(itemMatch[1], 10) : 0;
          return NextResponse.json({ error: 'conflict', conflictingItemIndex }, { status: 409 });
        }
        logger.error('[GROUP_BOOKINGS] RPC error', rpcError);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
      }

      result = rpcResult;
    }

    // TODO(INFRA-A-event-bus): emit('booking.group_created', { groupId: result.visit_group_id })

    return NextResponse.json({ visitGroup: { id: result.visit_group_id }, bookings: result.bookings }, { status: 201 });

  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === 'UnauthorizedError') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err.name === 'NotFoundError') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    logger.error('[GROUP_BOOKINGS] Unexpected error in group booking', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
