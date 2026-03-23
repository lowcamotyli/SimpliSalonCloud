CREATE TABLE public.service_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    duration_delta INTEGER NOT NULL DEFAULT 0,
    price_delta NUMERIC(10, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.service_addons IS 'Optional add-ons for services, like an extended massage or special products.';
COMMENT ON COLUMN public.service_addons.duration_delta IS 'Additional time in minutes this add-on adds to the service.';
COMMENT ON COLUMN public.service_addons.price_delta IS 'Additional cost for this add-on.';

CREATE INDEX idx_service_addons_salon_id ON public.service_addons(salon_id);
CREATE INDEX idx_service_addons_service_id ON public.service_addons(service_id);

CREATE TABLE public.booking_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES public.service_addons(id) ON DELETE RESTRICT,
    price_at_booking NUMERIC(10, 2) NOT NULL,
    duration_at_booking INTEGER NOT NULL
);

COMMENT ON TABLE public.booking_addons IS 'Records which service add-ons were selected for a specific booking.';
COMMENT ON COLUMN public.booking_addons.price_at_booking IS 'Snapshot of the add-on''s price at the time of booking.';
COMMENT ON COLUMN public.booking_addons.duration_at_booking IS 'Snapshot of the add-on''s duration at the time of booking.';

CREATE INDEX idx_booking_addons_booking_id ON public.booking_addons(booking_id);
CREATE INDEX idx_booking_addons_addon_id ON public.booking_addons(addon_id);

ALTER TABLE public.service_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow salon members to manage service add-ons"
ON public.service_addons
FOR ALL
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

ALTER TABLE public.booking_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow salon members to manage booking add-ons"
ON public.booking_addons
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.bookings
        WHERE bookings.id = booking_addons.booking_id
        AND bookings.salon_id = public.get_user_salon_id()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.bookings
        WHERE bookings.id = booking_addons.booking_id
        AND bookings.salon_id = public.get_user_salon_id()
    )
);
