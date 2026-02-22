-- ========================================
-- SYSTEM SUBSKRYPCJI DLA SIMPLISALONCLOUD
-- Data: 2026-02-15
-- Wersja: 1.0
-- ========================================
-- Implementuje kompletny system subskrypcji z:
-- - Tabelami subscriptions, invoices, payment_methods, usage_tracking, feature_flags
-- - Rozszerzeniem tabeli salons o dane billing
-- - Row Level Security (RLS) policies
-- - Indeksami dla performance
-- - Triggerami dla automatyzacji
-- ========================================

-- ========================================
-- 1. ROZSZERZENIE TABELI SALONS
-- ========================================

-- Dodaj kolumny związane z subskrypcją do istniejącej tabeli salons
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT; -- NIP w Polsce

-- Dodaj constrainty dla istniejących kolumn (jeśli jeszcze nie istnieją)
DO $$
BEGIN
  -- Sprawdź czy kolumna subscription_plan istnieje, jeśli nie - dodaj
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'salons' AND column_name = 'subscription_plan'
  ) THEN
    ALTER TABLE public.salons ADD COLUMN subscription_plan TEXT DEFAULT 'starter';
  END IF;

  -- Sprawdź czy kolumna subscription_status istnieje, jeśli nie - dodaj
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'salons' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE public.salons ADD COLUMN subscription_status TEXT DEFAULT 'trialing';
  END IF;
END $$;

-- Usuń istniejące constrainty przed normalizacją danych,
-- aby nie blokowały mapowania legacy wartości
ALTER TABLE public.salons
  DROP CONSTRAINT IF EXISTS salons_subscription_plan_check,
  DROP CONSTRAINT IF EXISTS salons_subscription_status_check;

-- Uporządkuj legacy wartości przed założeniem constraintów
UPDATE public.salons
SET subscription_plan = CASE LOWER(COALESCE(subscription_plan, 'starter'))
  WHEN 'free' THEN 'starter'
  WHEN 'trial' THEN 'starter'
  WHEN 'basic' THEN 'starter'
  WHEN 'starter' THEN 'starter'
  WHEN 'pro' THEN 'professional'
  WHEN 'professional' THEN 'professional'
  WHEN 'premium' THEN 'business'
  WHEN 'business' THEN 'business'
  WHEN 'enterprise' THEN 'enterprise'
  ELSE 'starter'
END;

UPDATE public.salons
SET subscription_status = CASE LOWER(COALESCE(subscription_status, 'trialing'))
  WHEN 'active' THEN 'active'
  WHEN 'trial' THEN 'trialing'
  WHEN 'trialing' THEN 'trialing'
  WHEN 'past_due' THEN 'past_due'
  WHEN 'overdue' THEN 'past_due'
  WHEN 'canceled' THEN 'canceled'
  WHEN 'cancelled' THEN 'canceled'
  WHEN 'paused' THEN 'paused'
  ELSE 'trialing'
END;

-- Dodaj/zaktualizuj constrainty
ALTER TABLE public.salons
  DROP CONSTRAINT IF EXISTS salons_subscription_plan_check,
  ADD CONSTRAINT salons_subscription_plan_check
    CHECK (subscription_plan IN ('starter', 'professional', 'business', 'enterprise'));

ALTER TABLE public.salons
  DROP CONSTRAINT IF EXISTS salons_subscription_status_check,
  ADD CONSTRAINT salons_subscription_status_check
    CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'paused'));

-- Walidacja NIP (11 cyfr)
ALTER TABLE public.salons
  DROP CONSTRAINT IF EXISTS salons_tax_id_format_check,
  ADD CONSTRAINT salons_tax_id_format_check
    CHECK (tax_id IS NULL OR (tax_id ~ '^\d{10}$' AND LENGTH(tax_id) = 10));

COMMENT ON COLUMN public.salons.trial_ends_at IS 'Data zakończenia okresu próbnego (14 dni od rejestracji)';
COMMENT ON COLUMN public.salons.subscription_started_at IS 'Data rozpoczęcia płatnej subskrypcji';
COMMENT ON COLUMN public.salons.billing_email IS 'Email do faktur i powiadomień o płatnościach';
COMMENT ON COLUMN public.salons.tax_id IS 'NIP firmy (wymagany do faktur VAT)';

-- ========================================
-- 2. TABELA SUBSCRIPTIONS
-- ========================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,

  -- Plan details
  plan_type TEXT NOT NULL CHECK (plan_type IN ('starter', 'professional', 'business', 'enterprise')),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),

  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused')),

  -- Dates
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  canceled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Pricing (w groszach)
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',

  -- Przelewy24 integration
  p24_transaction_id TEXT,
  p24_order_id TEXT,

  -- Metadata (JSON dla dodatkowych danych)
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT subscriptions_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT subscriptions_period_valid CHECK (current_period_end > current_period_start)
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_subscriptions_salon_id ON public.subscriptions(salon_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON public.subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_p24_transaction ON public.subscriptions(p24_transaction_id)
  WHERE p24_transaction_id IS NOT NULL;

-- Komentarze
COMMENT ON TABLE public.subscriptions IS 'Główna tabela subskrypcji - historia i status planów salonu';
COMMENT ON COLUMN public.subscriptions.amount_cents IS 'Kwota w groszach (np. 29900 = 299 PLN)';
COMMENT ON COLUMN public.subscriptions.p24_transaction_id IS 'ID transakcji z Przelewy24 (dla powiązania płatności)';

-- ========================================
-- 3. TABELA INVOICES
-- ========================================

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,

  -- Invoice details
  invoice_number TEXT NOT NULL UNIQUE, -- Format: "INV-2026-001234"

  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),

  -- Amounts (w groszach)
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER DEFAULT 0, -- VAT 23% w Polsce
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',

  -- Billing info
  billing_name TEXT NOT NULL,
  billing_email TEXT NOT NULL,
  billing_address JSONB, -- { street, city, postalCode, country, taxId }

  -- Payment
  payment_method TEXT CHECK (payment_method IN ('card', 'transfer', 'blik', 'p24')),
  paid_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ,

  -- Przelewy24 integration
  p24_transaction_id TEXT,
  p24_order_id TEXT,

  -- PDF storage
  pdf_url TEXT,

  -- Line items (JSON array z pozycjami faktury)
  line_items JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT invoices_amounts_valid CHECK (total_cents = subtotal_cents + tax_cents),
  CONSTRAINT invoices_amounts_positive CHECK (total_cents > 0)
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_invoices_salon_id ON public.invoices(salon_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON public.invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_p24_transaction ON public.invoices(p24_transaction_id)
  WHERE p24_transaction_id IS NOT NULL;

-- Komentarze
COMMENT ON TABLE public.invoices IS 'Faktury VAT dla płatności subskrypcji';
COMMENT ON COLUMN public.invoices.invoice_number IS 'Unikalny numer faktury (generowany automatycznie)';
COMMENT ON COLUMN public.invoices.line_items IS 'JSON array z pozycjami: [{ description, quantity, unit_price, total }]';

-- ========================================
-- 4. TABELA PAYMENT_METHODS
-- ========================================

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,

  -- Type
  type TEXT NOT NULL CHECK (type IN ('card', 'bank_transfer', 'blik')),

  -- Card details (jeśli type = 'card')
  card_brand TEXT, -- visa, mastercard, etc.
  card_last4 TEXT,
  card_exp_month INTEGER CHECK (card_exp_month BETWEEN 1 AND 12),
  card_exp_year INTEGER CHECK (card_exp_year >= 2024),

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- Przelewy24 tokenization
  p24_payment_method_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT payment_methods_card_details_required CHECK (
    type != 'card' OR (card_brand IS NOT NULL AND card_last4 IS NOT NULL)
  )
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_payment_methods_salon_id ON public.payment_methods(salon_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON public.payment_methods(salon_id, is_default)
  WHERE is_default = true;

-- Komentarze
COMMENT ON TABLE public.payment_methods IS 'Zapisane metody płatności salonu (tokenizowane przez Przelewy24)';

-- ========================================
-- 5. TABELA USAGE_TRACKING
-- ========================================

CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,

  -- Period
  period_month TEXT NOT NULL, -- Format: "2026-02"

  -- Counters
  bookings_count INTEGER DEFAULT 0,
  clients_count INTEGER DEFAULT 0,
  employees_count INTEGER DEFAULT 0,
  api_calls_count INTEGER DEFAULT 0,

  -- Exceeded flags
  bookings_limit_exceeded BOOLEAN DEFAULT false,
  clients_limit_exceeded BOOLEAN DEFAULT false,
  employees_limit_exceeded BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint (jeden rekord per salon per miesiąc)
  UNIQUE(salon_id, period_month)
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_usage_tracking_salon_period ON public.usage_tracking(salon_id, period_month);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_period ON public.usage_tracking(period_month);

-- Komentarze
COMMENT ON TABLE public.usage_tracking IS 'Tracking limitów użycia dla każdego salonu (miesięczne agregaty)';
COMMENT ON COLUMN public.usage_tracking.period_month IS 'Format YYYY-MM (np. "2026-02")';

-- ========================================
-- 6. TABELA FEATURE_FLAGS
-- ========================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,

  -- Feature name
  feature_name TEXT NOT NULL,
  -- Możliwe wartości:
  -- 'booksy_integration', 'google_calendar', 'api_access',
  -- 'multi_salon', 'pdf_export', 'sms_notifications',
  -- 'email_notifications', 'white_label', 'advanced_analytics'

  -- Status
  enabled BOOLEAN DEFAULT false,

  -- Opcjonalny limit (np. max_employees = 10)
  limit_value INTEGER,

  -- Expiration (opcjonalne - dla trial features)
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint (jedna feature per salon)
  UNIQUE(salon_id, feature_name)
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_feature_flags_salon_feature ON public.feature_flags(salon_id, feature_name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON public.feature_flags(salon_id, enabled)
  WHERE enabled = true;

-- Komentarze
COMMENT ON TABLE public.feature_flags IS 'Feature gating - kontrola dostępu do funkcjonalności w zależności od planu';

-- ========================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ========================================

-- Włącz RLS dla nowych tabel
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- SUBSCRIPTIONS - tylko owner może widzieć
DROP POLICY IF EXISTS "Salon owners can view subscriptions" ON public.subscriptions;
CREATE POLICY "Salon owners can view subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  );

DROP POLICY IF EXISTS "Salon owners can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Salon owners can manage subscriptions"
  ON public.subscriptions
  FOR ALL
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  )
  WITH CHECK (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  );

-- INVOICES - owner i manager mogą widzieć
DROP POLICY IF EXISTS "Salon owners and managers can view invoices" ON public.invoices;
CREATE POLICY "Salon owners and managers can view invoices"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  );

-- PAYMENT_METHODS - tylko owner
DROP POLICY IF EXISTS "Salon owners can manage payment methods" ON public.payment_methods;
CREATE POLICY "Salon owners can manage payment methods"
  ON public.payment_methods
  FOR ALL
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  )
  WITH CHECK (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  );

-- USAGE_TRACKING - wszyscy mogą czytać (dla pokazywania limitów w UI)
DROP POLICY IF EXISTS "Salon members can view usage tracking" ON public.usage_tracking;
CREATE POLICY "Salon members can view usage tracking"
  ON public.usage_tracking
  FOR SELECT
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
  );

-- FEATURE_FLAGS - wszyscy mogą czytać (dla feature gating)
DROP POLICY IF EXISTS "Salon members can view feature flags" ON public.feature_flags;
CREATE POLICY "Salon members can view feature flags"
  ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
  );

-- ========================================
-- 8. FUNKCJE POMOCNICZE
-- ========================================

-- Funkcja do generowania invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  year TEXT;
  sequence_num INTEGER;
  invoice_num TEXT;
BEGIN
  year := TO_CHAR(NOW(), 'YYYY');

  -- Znajdź najwyższy numer faktury w tym roku
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING(invoice_number FROM 'INV-\d{4}-(\d{6})')
        AS INTEGER
      )
    ),
    0
  ) + 1
  INTO sequence_num
  FROM public.invoices
  WHERE invoice_number LIKE 'INV-' || year || '-%';

  -- Format: INV-2026-000001
  invoice_num := 'INV-' || year || '-' || LPAD(sequence_num::TEXT, 6, '0');

  RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.generate_invoice_number() IS 'Generuje unikalny numer faktury w formacie INV-YYYY-NNNNNN';

-- Funkcja do obliczania VAT (23% w Polsce)
CREATE OR REPLACE FUNCTION public.calculate_vat(
  subtotal_cents INTEGER
)
RETURNS INTEGER AS $$
BEGIN
  RETURN FLOOR(subtotal_cents * 0.23);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.calculate_vat(INTEGER) IS 'Oblicza VAT 23% od kwoty netto';

-- ========================================
-- 9. TRIGGERY
-- ========================================

-- Trigger: Automatyczne ustawianie updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Zastosuj trigger do wszystkich tabel
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_usage_tracking_updated_at ON public.usage_tracking;
CREATE TRIGGER update_usage_tracking_updated_at
  BEFORE UPDATE ON public.usage_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: Automatyczne generowanie invoice_number
CREATE OR REPLACE FUNCTION public.set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_invoice_number_trigger ON public.invoices;
CREATE TRIGGER set_invoice_number_trigger
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_invoice_number();

-- Trigger: Sync subscription status z salons table
CREATE OR REPLACE FUNCTION public.sync_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Aktualizuj status w tabeli salons gdy zmienia się w subscriptions
  UPDATE public.salons
  SET
    subscription_plan = NEW.plan_type,
    subscription_status = NEW.status,
    subscription_started_at = CASE
      WHEN NEW.status = 'active' AND OLD.status != 'active'
      THEN NOW()
      ELSE subscription_started_at
    END
  WHERE id = NEW.salon_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_subscription_status_trigger ON public.subscriptions;
CREATE TRIGGER sync_subscription_status_trigger
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_subscription_status();

-- ========================================
-- 10. DANE DOMYŚLNE
-- ========================================

-- Ustaw domyślne feature flags dla wszystkich istniejących salonów (STARTER plan)
INSERT INTO public.feature_flags (salon_id, feature_name, enabled, limit_value)
SELECT
  id as salon_id,
  unnest(ARRAY[
    'google_calendar',
    'pdf_export',
    'email_notifications'
  ]) as feature_name,
  true as enabled,
  NULL as limit_value
FROM public.salons
ON CONFLICT (salon_id, feature_name) DO NOTHING;

-- Ustaw limity dla STARTER plan
INSERT INTO public.feature_flags (salon_id, feature_name, enabled, limit_value)
SELECT
  id as salon_id,
  'max_employees' as feature_name,
  true as enabled,
  2 as limit_value
FROM public.salons
WHERE subscription_plan = 'starter'
ON CONFLICT (salon_id, feature_name) DO UPDATE
SET limit_value = EXCLUDED.limit_value;

-- Ustaw trial dla istniejących salonów (14 dni od teraz)
UPDATE public.salons
SET
  trial_ends_at = NOW() + INTERVAL '14 days',
  subscription_status = 'trialing'
WHERE
  subscription_status IS NULL
  AND trial_ends_at IS NULL;

-- ========================================
-- 11. GRANTY (PERMISSIONS)
-- ========================================

-- Service role ma pełny dostęp (dla backend operations)
GRANT ALL ON public.subscriptions TO service_role;
GRANT ALL ON public.invoices TO service_role;
GRANT ALL ON public.payment_methods TO service_role;
GRANT ALL ON public.usage_tracking TO service_role;
GRANT ALL ON public.feature_flags TO service_role;

-- Authenticated users - dostęp kontrolowany przez RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT SELECT ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT SELECT ON public.usage_tracking TO authenticated;
GRANT SELECT ON public.feature_flags TO authenticated;

-- ========================================
-- KONIEC MIGRACJI
-- ========================================

-- Loguj sukces
DO $$
BEGIN
  RAISE NOTICE '✅ Subscription system migration completed successfully';
  RAISE NOTICE '📦 Created tables: subscriptions, invoices, payment_methods, usage_tracking, feature_flags';
  RAISE NOTICE '🔒 RLS policies enabled for all tables';
  RAISE NOTICE '🎯 Feature flags initialized for existing salons';
END $$;
