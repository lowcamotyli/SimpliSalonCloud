-- Bug 3.4: Booksy bookings (source='booksy', status='scheduled') never incremented
-- visit_count because the trigger only fired for status='completed'. Fix in 3 steps:
-- 1. Update trigger to count Booksy bookings on INSERT
-- 2. Backfill crm_completed_booking_applications for existing Booksy bookings
-- 3. Recalculate visit_count / last_visit_at for all clients

CREATE OR REPLACE FUNCTION public.crm_apply_completed_booking_to_client()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  booking_total NUMERIC(10,2);
  booking_visit_at TIMESTAMPTZ;
  applied_booking_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'booksy' THEN
      -- Booksy bookings are already confirmed; skip only if cancelled/no_show
      IF NEW.status IN ('cancelled', 'no_show') THEN RETURN NEW; END IF;
      -- else fall through to increment
    ELSIF NEW.status <> 'completed' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'completed' OR COALESCE(OLD.status, '') = 'completed' THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  booking_total := COALESCE(NEW.total_price, NEW.base_price + COALESCE(NEW.surcharge, 0), 0);
  booking_visit_at := timezone('UTC', NEW.booking_date::timestamp + NEW.booking_time);

  INSERT INTO public.crm_completed_booking_applications (booking_id, salon_id, client_id)
  VALUES (NEW.id, NEW.salon_id, NEW.client_id)
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING booking_id INTO applied_booking_id;

  IF applied_booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.clients AS c
  SET
    last_visit_at = CASE
      WHEN c.last_visit_at IS NULL THEN booking_visit_at
      ELSE GREATEST(c.last_visit_at, booking_visit_at)
    END,
    total_spent = COALESCE(c.total_spent, 0) + booking_total,
    visit_count = COALESCE(c.visit_count, 0) + 1,
    updated_at = NOW()
  WHERE c.id = NEW.client_id
    AND c.salon_id = NEW.salon_id
    AND c.deleted_at IS NULL;

  RETURN NEW;
END;
$$;

INSERT INTO public.crm_completed_booking_applications (booking_id, salon_id, client_id)
SELECT id, salon_id, client_id FROM public.bookings
WHERE source = 'booksy' AND status NOT IN ('cancelled', 'no_show') AND deleted_at IS NULL
ON CONFLICT (booking_id) DO NOTHING;

INSERT INTO public.crm_completed_booking_applications (booking_id, salon_id, client_id)
SELECT id, salon_id, client_id FROM public.bookings
WHERE status = 'completed' AND deleted_at IS NULL
ON CONFLICT (booking_id) DO NOTHING;

UPDATE public.clients AS c
SET visit_count = sub.cnt,
    last_visit_at = CASE WHEN sub.last_visit IS NOT NULL AND (c.last_visit_at IS NULL OR sub.last_visit > c.last_visit_at) THEN sub.last_visit ELSE c.last_visit_at END,
    updated_at = NOW()
FROM (
  SELECT cba.client_id, COUNT(*) AS cnt,
    MAX((b.booking_date::text || ' ' || b.booking_time::text)::timestamp AT TIME ZONE 'UTC') AS last_visit
  FROM public.crm_completed_booking_applications cba
  JOIN public.bookings b ON b.id = cba.booking_id
  GROUP BY cba.client_id
) AS sub
WHERE c.id = sub.client_id AND c.deleted_at IS NULL;
