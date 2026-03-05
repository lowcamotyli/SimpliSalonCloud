-- Sprint 02 v3: equipment_bookings with EXCLUDE constraint + check_equipment_availability function
-- Requires btree_gist extension (enabled in Sprint 00 migration)

CREATE TABLE public.equipment_bookings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID        NOT NULL REFERENCES public.bookings(id)   ON DELETE CASCADE,
  equipment_id UUID        NOT NULL REFERENCES public.equipment(id)  ON DELETE RESTRICT,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_equipment_booking_time CHECK (ends_at > starts_at),
  EXCLUDE USING gist (
    equipment_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
);

CREATE INDEX idx_equipment_bookings_equipment ON public.equipment_bookings(equipment_id);
CREATE INDEX idx_equipment_bookings_booking   ON public.equipment_bookings(booking_id);
CREATE INDEX idx_equipment_bookings_time
  ON public.equipment_bookings USING gist(equipment_id, tstzrange(starts_at, ends_at, '[)'));

ALTER TABLE public.equipment_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salon_read_equipment_bookings" ON public.equipment_bookings
  FOR SELECT USING (
    equipment_id IN (
      SELECT id FROM public.equipment
      WHERE salon_id = public.get_user_salon_id()
    )
  );

CREATE POLICY "salon_write_equipment_bookings" ON public.equipment_bookings
  FOR ALL USING (
    equipment_id IN (
      SELECT id FROM public.equipment
      WHERE salon_id = public.get_user_salon_id()
    )
  );

CREATE OR REPLACE FUNCTION public.check_equipment_availability(
  p_equipment_ids      UUID[],
  p_starts_at          TIMESTAMPTZ,
  p_ends_at            TIMESTAMPTZ,
  p_exclude_booking_id UUID DEFAULT NULL
) RETURNS TABLE(equipment_id UUID, is_available BOOLEAN, conflict_booking_id UUID)
LANGUAGE sql STABLE AS $$
  -- CTE scans equipment_bookings once; the main query LEFT JOINs to derive
  -- both is_available and conflict_booking_id without a second subquery scan.
  WITH conflicts AS (
    SELECT DISTINCT ON (eb.equipment_id)
      eb.equipment_id,
      eb.booking_id AS conflict_booking_id
    FROM public.equipment_bookings eb
    WHERE eb.equipment_id = ANY(p_equipment_ids)
      AND tstzrange(eb.starts_at, eb.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
      AND (p_exclude_booking_id IS NULL OR eb.booking_id != p_exclude_booking_id)
  )
  SELECT
    e.id                       AS equipment_id,
    (c.equipment_id IS NULL)   AS is_available,
    c.conflict_booking_id
  FROM public.equipment e
  LEFT JOIN conflicts c ON c.equipment_id = e.id
  WHERE e.id = ANY(p_equipment_ids)
$$;
