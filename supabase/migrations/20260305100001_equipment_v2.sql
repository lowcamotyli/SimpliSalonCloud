-- Sprint 02 v2: service_equipment junction table
CREATE TABLE IF NOT EXISTS public.service_equipment (
  service_id   UUID NOT NULL REFERENCES public.services(id)   ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id)  ON DELETE CASCADE,
  PRIMARY KEY (service_id, equipment_id)
);
CREATE INDEX IF NOT EXISTS idx_service_equipment_service   ON public.service_equipment(service_id);
CREATE INDEX IF NOT EXISTS idx_service_equipment_equipment ON public.service_equipment(equipment_id);
ALTER TABLE public.service_equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "salon_read_service_equipment" ON public.service_equipment;
DROP POLICY IF EXISTS "salon_read_service_equipment" ON public.service_equipment;
CREATE POLICY "salon_read_service_equipment" ON public.service_equipment
  FOR SELECT USING (
    service_id IN (
      SELECT id FROM public.services
      WHERE salon_id = public.get_user_salon_id()
    )
  );
DROP POLICY IF EXISTS "owner_write_service_equipment" ON public.service_equipment;
DROP POLICY IF EXISTS "owner_write_service_equipment" ON public.service_equipment;
CREATE POLICY "owner_write_service_equipment" ON public.service_equipment
  FOR ALL USING (
    service_id IN (
      SELECT id FROM public.services
      WHERE salon_id = public.get_user_salon_id()
    )
    AND public.has_any_salon_role(ARRAY['owner','manager'])
  );
