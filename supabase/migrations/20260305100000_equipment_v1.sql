-- Sprint 02 v1: Equipment table
CREATE TABLE public.equipment (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id    UUID        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'other'
                CHECK (type IN ('laser','fotel','stol_manicure','fotopolimeryzator','inne','other')),
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_equipment_salon  ON public.equipment(salon_id);
CREATE INDEX idx_equipment_active ON public.equipment(salon_id, is_active);
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salon_read_equipment" ON public.equipment
  FOR SELECT USING (
    salon_id = public.get_user_salon_id()
  );
CREATE POLICY "owner_write_equipment" ON public.equipment
  FOR ALL USING (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner','manager'])
  );
