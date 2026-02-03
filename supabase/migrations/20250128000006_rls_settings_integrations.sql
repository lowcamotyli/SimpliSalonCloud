-- ========================================
-- ROW LEVEL SECURITY: SALON_SETTINGS & SALON_INTEGRATIONS
-- Wszyscy mogą czytać, tylko owner może edytować
-- ========================================
-- ========================================
-- SALON_SETTINGS
-- ========================================
ALTER TABLE public.salon_settings ENABLE ROW LEVEL SECURITY;
-- Wszyscy z salonu mogą czytać ustawienia
DROP POLICY IF EXISTS "Salon members can view settings" ON public.salon_settings;
CREATE POLICY "Salon members can view settings" ON public.salon_settings FOR
SELECT TO authenticated USING (salon_id = public.get_user_salon_id());
-- Tylko owner może tworzyć ustawienia (podczas setup)
DROP POLICY IF EXISTS "Owners can create settings" ON public.salon_settings;
CREATE POLICY "Owners can create settings" ON public.salon_settings FOR
INSERT TO authenticated WITH CHECK (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  );
-- Tylko owner może edytować ustawienia
DROP POLICY IF EXISTS "Owners can update settings" ON public.salon_settings;
CREATE POLICY "Owners can update settings" ON public.salon_settings FOR
UPDATE TO authenticated USING (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  ) WITH CHECK (salon_id = public.get_user_salon_id());
-- ========================================
-- SALON_INTEGRATIONS
-- ========================================
ALTER TABLE public.salon_integrations ENABLE ROW LEVEL SECURITY;
-- Wszyscy z salonu mogą czytać integracje
DROP POLICY IF EXISTS "Salon members can view integrations" ON public.salon_integrations;
CREATE POLICY "Salon members can view integrations" ON public.salon_integrations FOR
SELECT TO authenticated USING (salon_id = public.get_user_salon_id());
-- Tylko owner może tworzyć integracje
DROP POLICY IF EXISTS "Owners can create integrations" ON public.salon_integrations;
CREATE POLICY "Owners can create integrations" ON public.salon_integrations FOR
INSERT TO authenticated WITH CHECK (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  );
-- Tylko owner może edytować integracje
DROP POLICY IF EXISTS "Owners can update integrations" ON public.salon_integrations;
CREATE POLICY "Owners can update integrations" ON public.salon_integrations FOR
UPDATE TO authenticated USING (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  ) WITH CHECK (salon_id = public.get_user_salon_id());
-- Tylko owner może usuwać integracje
DROP POLICY IF EXISTS "Owners can delete integrations" ON public.salon_integrations;
CREATE POLICY "Owners can delete integrations" ON public.salon_integrations FOR DELETE TO authenticated USING (
  salon_id = public.get_user_salon_id()
  AND public.has_salon_role('owner')
);
-- ========================================
-- COMMENTS
-- ========================================
COMMENT ON POLICY "Salon members can view settings" ON public.salon_settings IS 'Wszyscy pracownicy salonu mogą przeglądać ustawienia.';
COMMENT ON POLICY "Owners can create settings" ON public.salon_settings IS 'Tylko właściciel może utworzyć ustawienia salonu (podczas inicjalizacji).';
COMMENT ON POLICY "Owners can update settings" ON public.salon_settings IS 'Tylko właściciel może edytować ustawienia salonu.';
COMMENT ON POLICY "Salon members can view integrations" ON public.salon_integrations IS 'Wszyscy pracownicy salonu mogą przeglądać integracje.';
COMMENT ON POLICY "Owners can create integrations" ON public.salon_integrations IS 'Tylko właściciel może dodawać nowe integracje.';
COMMENT ON POLICY "Owners can update integrations" ON public.salon_integrations IS 'Tylko właściciel może edytować integracje.';
COMMENT ON POLICY "Owners can delete integrations" ON public.salon_integrations IS 'Tylko właściciel może usuwać integracje.';

