-- ========================================
-- ROLLBACK: SUBSCRIPTION SYSTEM
-- Data: 2026-02-15
-- ========================================
-- Ten skrypt cofa zmiany z migracji 20260215000000_add_subscription_system.sql
-- Użyj TYLKO jeśli migracja forward nie powiodła się
-- ========================================

-- UWAGA: To jest DESTRUKCYJNE - usuwa wszystkie dane subskrypcji!
-- Przed uruchomieniem zrób backup bazy danych:
-- supabase db dump > backup_before_rollback.sql

-- ========================================
-- 1. USUŃ TRIGGERY
-- ========================================

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON public.payment_methods;
DROP TRIGGER IF EXISTS update_usage_tracking_updated_at ON public.usage_tracking;
DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON public.feature_flags;
DROP TRIGGER IF EXISTS set_invoice_number_trigger ON public.invoices;
DROP TRIGGER IF EXISTS sync_subscription_status_trigger ON public.subscriptions;

-- ========================================
-- 2. USUŃ FUNKCJE
-- ========================================

DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.set_invoice_number() CASCADE;
DROP FUNCTION IF EXISTS public.sync_subscription_status() CASCADE;
DROP FUNCTION IF EXISTS public.generate_invoice_number() CASCADE;
DROP FUNCTION IF EXISTS public.calculate_vat(INTEGER) CASCADE;

-- ========================================
-- 3. USUŃ RLS POLICIES
-- ========================================

-- Subscriptions
DROP POLICY IF EXISTS "Salon owners can view subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Salon owners can manage subscriptions" ON public.subscriptions;

-- Invoices
DROP POLICY IF EXISTS "Salon owners and managers can view invoices" ON public.invoices;

-- Payment Methods
DROP POLICY IF EXISTS "Salon owners can manage payment methods" ON public.payment_methods;

-- Usage Tracking
DROP POLICY IF EXISTS "Salon members can view usage tracking" ON public.usage_tracking;

-- Feature Flags
DROP POLICY IF EXISTS "Salon members can view feature flags" ON public.feature_flags;

-- ========================================
-- 4. USUŃ TABELE (w odwrotnej kolejności - respektuj foreign keys)
-- ========================================

DROP TABLE IF EXISTS public.feature_flags CASCADE;
DROP TABLE IF EXISTS public.usage_tracking CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;

-- ========================================
-- 5. USUŃ KOLUMNY Z TABELI SALONS
-- ========================================

-- Usuń nowe kolumny (jeśli migracja była częściowo wykonana)
ALTER TABLE public.salons
  DROP COLUMN IF EXISTS trial_ends_at,
  DROP COLUMN IF EXISTS subscription_started_at,
  DROP COLUMN IF EXISTS billing_email,
  DROP COLUMN IF EXISTS tax_id;

-- Usuń constrainty (jeśli istnieją)
ALTER TABLE public.salons
  DROP CONSTRAINT IF EXISTS salons_subscription_plan_check,
  DROP CONSTRAINT IF EXISTS salons_subscription_status_check,
  DROP CONSTRAINT IF EXISTS salons_tax_id_format_check;

-- Opcjonalnie: Usuń kolumny subscription_plan i subscription_status
-- UWAGA: Odkomentuj TYLKO jeśli chcesz całkowicie usunąć te kolumny
-- ALTER TABLE public.salons
--   DROP COLUMN IF EXISTS subscription_plan,
--   DROP COLUMN IF EXISTS subscription_status;

-- ========================================
-- KONIEC ROLLBACK
-- ========================================

DO $$
BEGIN
  RAISE NOTICE '✅ Subscription system rollback completed';
  RAISE NOTICE '⚠️  All subscription data has been removed';
  RAISE NOTICE '💡 Restore from backup if needed: psql < backup_before_rollback.sql';
END $$;
