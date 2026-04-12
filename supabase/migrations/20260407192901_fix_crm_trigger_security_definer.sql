CREATE OR REPLACE FUNCTION public.crm_apply_completed_booking_to_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
