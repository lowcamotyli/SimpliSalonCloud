-- ========================================
-- ROW LEVEL SECURITY: PAYROLL
-- Only owner can manage payroll, employees see own entries
-- ========================================
-- ========================================
-- PAYROLL_RUNS TABLE
-- ========================================
-- Check if table exists before applying RLS
DO $$ BEGIN IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'payroll_runs'
) THEN -- Włącz RLS dla payroll_runs
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
-- POLICY 1: Tylko owner może widzieć payroll runs
DROP POLICY IF EXISTS "Only owners can view payroll runs" ON public.payroll_runs;
CREATE POLICY "Only owners can view payroll runs" ON public.payroll_runs FOR
SELECT TO authenticated USING (
        salon_id = public.get_user_salon_id()
        AND public.has_salon_role('owner')
        AND deleted_at IS NULL
    );
-- POLICY 2: Tylko owner może tworzyć payroll runs
DROP POLICY IF EXISTS "Only owners can create payroll runs" ON public.payroll_runs;
CREATE POLICY "Only owners can create payroll runs" ON public.payroll_runs FOR
INSERT TO authenticated WITH CHECK (
        salon_id = public.get_user_salon_id()
        AND public.has_salon_role('owner')
    );
-- POLICY 3: Tylko owner może edytować payroll runs
DROP POLICY IF EXISTS "Only owners can update payroll runs" ON public.payroll_runs;
CREATE POLICY "Only owners can update payroll runs" ON public.payroll_runs FOR
UPDATE TO authenticated USING (
        salon_id = public.get_user_salon_id()
        AND public.has_salon_role('owner')
    ) WITH CHECK (
        salon_id = public.get_user_salon_id()
    );
-- POLICY 4: Tylko owner może usuwać payroll runs
DROP POLICY IF EXISTS "Only owners can delete payroll runs" ON public.payroll_runs;
CREATE POLICY "Only owners can delete payroll runs" ON public.payroll_runs FOR DELETE TO authenticated USING (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
);
RAISE NOTICE 'RLS policies created for payroll_runs table';
ELSE RAISE NOTICE 'Table payroll_runs does not exist - skipping RLS setup';
END IF;
END $$;
-- ========================================
-- PAYROLL_ENTRIES TABLE
-- ========================================
DO $$ BEGIN IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'payroll_entries'
) THEN -- Włącz RLS dla payroll_entries
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;
-- POLICY 1: Owner widzi wszystkie entries, employee tylko swoje
DROP POLICY IF EXISTS "View payroll entries based on role" ON public.payroll_entries;
CREATE POLICY "View payroll entries based on role" ON public.payroll_entries FOR
SELECT TO authenticated USING (
        -- Musi być entry z payroll_run tego salonu
        payroll_run_id IN (
            SELECT id
            FROM public.payroll_runs
            WHERE salon_id = public.get_user_salon_id()
                AND deleted_at IS NULL
        )
        AND (
            -- Owner widzi wszystko
            public.has_salon_role('owner')
            OR -- Employee widzi tylko swoje entries
            employee_id = public.get_user_employee_id()
        )
    );
-- POLICY 2: Tylko owner może tworzyć entries
DROP POLICY IF EXISTS "Only owners can create payroll entries" ON public.payroll_entries;
CREATE POLICY "Only owners can create payroll entries" ON public.payroll_entries FOR
INSERT TO authenticated WITH CHECK (
        payroll_run_id IN (
            SELECT id
            FROM public.payroll_runs
            WHERE salon_id = public.get_user_salon_id()
                AND public.has_salon_role('owner')
        )
    );
-- POLICY 3: Tylko owner może edytować entries
DROP POLICY IF EXISTS "Only owners can update payroll entries" ON public.payroll_entries;
CREATE POLICY "Only owners can update payroll entries" ON public.payroll_entries FOR
UPDATE TO authenticated USING (
        payroll_run_id IN (
            SELECT id
            FROM public.payroll_runs
            WHERE salon_id = public.get_user_salon_id()
                AND public.has_salon_role('owner')
        )
    );
-- POLICY 4: Tylko owner może usuwać entries
DROP POLICY IF EXISTS "Only owners can delete payroll entries" ON public.payroll_entries;
CREATE POLICY "Only owners can delete payroll entries" ON public.payroll_entries FOR DELETE TO authenticated USING (
    payroll_run_id IN (
        SELECT id
        FROM public.payroll_runs
        WHERE salon_id = public.get_user_salon_id()
            AND public.has_salon_role('owner')
    )
);
RAISE NOTICE 'RLS policies created for payroll_entries table';
ELSE RAISE NOTICE 'Table payroll_entries does not exist - skipping RLS setup';
END IF;
END $$;
-- ========================================
-- COMMENTS
-- ========================================
-- Add comments if tables exist
DO $$ BEGIN IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'payroll_runs'
) THEN COMMENT ON POLICY "Only owners can view payroll runs" ON public.payroll_runs IS 'Tylko właściciele salonu mogą przeglądać okresy rozliczeniowe.';
COMMENT ON POLICY "Only owners can create payroll runs" ON public.payroll_runs IS 'Tylko właściciele salonu mogą tworzyć okresy rozliczeniowe.';
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'payroll_entries'
) THEN COMMENT ON POLICY "View payroll entries based on role" ON public.payroll_entries IS 'Właściciel widzi wszystkie wpisy payroll, pracownik widzi tylko swoje.';
COMMENT ON POLICY "Only owners can create payroll entries" ON public.payroll_entries IS 'Tylko właściciele mogą tworzyć wpisy payroll.';
END IF;
END $$;

