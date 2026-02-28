-- CRM Batch 1: enrich clients + keep visit stats in sync when booking becomes completed

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_spent NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_clients_salon_last_visit_at
  ON public.clients(salon_id, last_visit_at);

CREATE TABLE IF NOT EXISTS public.crm_completed_booking_applications (
  booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_completed_booking_applications_salon_client
  ON public.crm_completed_booking_applications(salon_id, client_id);

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
    IF NEW.status <> 'completed' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'completed' OR COALESCE(OLD.status, '') = 'completed' THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  booking_total := COALESCE(
    NEW.total_price,
    NEW.base_price + COALESCE(NEW.surcharge, 0),
    0
  );

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

DROP TRIGGER IF EXISTS trg_crm_booking_completed_update_client ON public.bookings;
CREATE TRIGGER trg_crm_booking_completed_update_client
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_apply_completed_booking_to_client();

