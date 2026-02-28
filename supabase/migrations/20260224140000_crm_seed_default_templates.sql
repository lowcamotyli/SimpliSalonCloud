-- ============================================================
-- CRM: Seed domyślnych szablonów wiadomości
-- Data: 2026-02-24
-- ============================================================
-- Tworzy funkcję seed_default_crm_templates(p_salon_id) oraz
-- wykonuje ją dla wszystkich istniejących salonów.
-- Dla nowych salonów funkcja powinna być wywołana z API
-- podczas procesu onboardingu.
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_default_crm_templates(p_salon_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.message_templates (salon_id, name, channel, subject, body, created_by)
  VALUES

  -- 1. Tęsknimy za Tobą (SMS)
  (
    p_salon_id,
    'Tęsknimy za Tobą',
    'sms',
    NULL,
    'Cześć {{first_name}}! 👋 Minęło już trochę czasu od Twojej ostatniej wizyty ({{last_visit_date}}). Tęsknimy! Zarezerwuj wizytę: {{booking_link}}',
    NULL
  ),

  -- 2. Podziękowanie po wizycie (Email)
  (
    p_salon_id,
    'Podziękowanie po wizycie',
    'email',
    'Dziękujemy za wizytę, {{first_name}}! 💛',
    'Cześć {{first_name}},

dziękujemy za odwiedziny w {{salon_name}}! Mamy nadzieję, że jesteś zadowolona z efektów.

Jeśli masz chwilę, będziemy wdzięczni za opinię. Twoje zdanie wiele dla nas znaczy!

Do zobaczenia wkrótce,
Zespół {{salon_name}}

---
Aby zrezygnować z wiadomości: {{unsubscribe_link}}',
    NULL
  ),

  -- 3. Urodzinowa niespodzianka (SMS)
  (
    p_salon_id,
    'Urodzinowa niespodzianka',
    'sms',
    NULL,
    '🎂 Wszystkiego najlepszego, {{first_name}}! Z okazji urodzin mamy dla Ciebie specjalną niespodziankę. Zadzwoń lub zarezerwuj online: {{booking_link}} – {{salon_name}}',
    NULL
  ),

  -- 4. Ekskluzywna oferta dla stałych klientów (Email)
  (
    p_salon_id,
    'Ekskluzywna oferta dla stałych klientów',
    'email',
    'Mamy coś specjalnego dla Ciebie, {{first_name}} 🌟',
    'Cześć {{first_name}},

jesteś jednym z naszych najcenniejszych klientów – {{visit_count}} wizyt mówi samo za siebie!

Właśnie dlatego przygotowaliśmy dla Ciebie ekskluzywną ofertę. Skontaktuj się z nami lub zarezerwuj wizytę, by poznać szczegóły.

👉 {{booking_link}}

Dziękujemy za zaufanie,
Zespół {{salon_name}}
{{salon_phone}}

---
Aby zrezygnować z wiadomości: {{unsubscribe_link}}',
    NULL
  )

  ON CONFLICT DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.seed_default_crm_templates(UUID)
  IS 'Seeduje 4 domyślne szablony CRM dla nowego lub istniejącego salonu. Bezpieczne do wielokrotnego wywołania (ON CONFLICT DO NOTHING).';

-- ============================================================
-- Seed dla wszystkich istniejących salonów
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.salons LOOP
    PERFORM public.seed_default_crm_templates(r.id);
  END LOOP;

  RAISE NOTICE '✅ Seeded default CRM templates for all existing salons';
END $$;
