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
  try {
    const { supabase, salonId: authSalonId } = await getAuthContext();
    const body: CreateGroupBookingBody = await request.json();

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

    const { data: result, error: rpcError } = await (supabase as any).rpc(
      'create_group_booking_atomic',
      {
        p_salon_id: authSalonId,
        p_client_id: body.clientId,
        p_payment_method: body.paymentMethod ?? null,
        p_notes: body.notes ?? null,
        p_items: rpcItems,
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
