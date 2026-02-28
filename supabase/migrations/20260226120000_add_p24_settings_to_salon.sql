-- ========================================
-- Przelewy24 per-salon configuration
-- Data: 2026-02-26
-- ========================================
-- Dodaje pola konfiguracyjne Przelewy24 do tabeli salon_settings,
-- tak aby każdy salon mógł skonfigurować własne konto P24
-- do przyjmowania płatności od klientów (depozyty, płatności online).
-- ========================================

ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS p24_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS p24_pos_id TEXT,
  ADD COLUMN IF NOT EXISTS p24_crc TEXT,       -- przechowywany zaszyfrowany
  ADD COLUMN IF NOT EXISTS p24_api_key TEXT,   -- przechowywany zaszyfrowany (opcjonalny)
  ADD COLUMN IF NOT EXISTS p24_api_url TEXT DEFAULT 'https://secure.przelewy24.pl',
  ADD COLUMN IF NOT EXISTS p24_sandbox_mode BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.salon_settings.p24_merchant_id IS 'Przelewy24 Merchant ID salonu';
COMMENT ON COLUMN public.salon_settings.p24_pos_id IS 'Przelewy24 POS ID salonu';
COMMENT ON COLUMN public.salon_settings.p24_crc IS 'Przelewy24 CRC Key (zaszyfrowany AES-256-GCM)';
COMMENT ON COLUMN public.salon_settings.p24_api_key IS 'Przelewy24 API Key do REST (zaszyfrowany, opcjonalny — fallback na CRC)';
COMMENT ON COLUMN public.salon_settings.p24_api_url IS 'URL bramki P24 (secure lub sandbox)';
COMMENT ON COLUMN public.salon_settings.p24_sandbox_mode IS 'Tryb testowy (sandbox) Przelewy24';

DO $$
BEGIN
  RAISE NOTICE '✅ P24 salon_settings columns added';
END $$;
