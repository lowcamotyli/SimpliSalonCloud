


CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions";

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."form_data_category" AS ENUM (
    'general',
    'health',
    'sensitive_health'
);


ALTER TYPE "public"."form_data_category" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_trigger_func"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  current_salon_id uuid;
  op text;
  old_data jsonb;
  new_data jsonb;
  rec_id uuid;
BEGIN
  -- Określ operację
  IF (TG_OP = 'INSERT') THEN
    op := 'INSERT';
    old_data := null;
    new_data := to_jsonb(NEW);
    rec_id := NEW.id;
    -- Próba pobrania salon_id z rekordu
    BEGIN
      current_salon_id := NEW.salon_id;
    EXCEPTION WHEN OTHERS THEN
      current_salon_id := public.get_user_salon_id(); -- Fallback
    END;
  ELSIF (TG_OP = 'UPDATE') THEN
    op := 'UPDATE';
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    rec_id := NEW.id;
    -- Sprawdź Soft Delete
    BEGIN
      IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
          op := 'SOFT_DELETE';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Ignoruj jeśli tabela nie ma kolumny deleted_at
    END;
    current_salon_id := NEW.salon_id;
  ELSIF (TG_OP = 'DELETE') THEN
    op := 'DELETE';
    old_data := to_jsonb(OLD);
    new_data := null;
    rec_id := OLD.id;
    current_salon_id := OLD.salon_id;
  END IF;

  -- Wstaw log
  INSERT INTO public.audit_logs (
    salon_id,
    table_name,
    record_id,
    operation,
    old_values,
    new_values,
    changed_by
  ) VALUES (
    current_salon_id,
    TG_TABLE_NAME::text,
    rec_id,
    op,
    old_data,
    new_data,
    auth.uid()
  );

  RETURN NULL; -- Trigger AFTER, więc return value jest ignorowany (dla ROW)
END;
$$;


ALTER FUNCTION "public"."audit_trigger_func"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_vat"("subtotal_cents" integer) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  RETURN FLOOR(subtotal_cents * 0.23);
END;
$$;


ALTER FUNCTION "public"."calculate_vat"("subtotal_cents" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_vat"("subtotal_cents" integer) IS 'Oblicza VAT 23% od kwoty netto';



CREATE OR REPLACE FUNCTION "public"."check_equipment_availability"("p_equipment_ids" "uuid"[], "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exclude_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("equipment_id" "uuid", "is_available" boolean, "conflict_booking_id" "uuid")
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    e.id AS equipment_id,
    NOT EXISTS (
      SELECT 1 FROM public.equipment_bookings eb
      WHERE eb.equipment_id = e.id
        AND tstzrange(eb.starts_at, eb.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
        AND (p_exclude_booking_id IS NULL OR eb.booking_id != p_exclude_booking_id)
    ) AS is_available,
    (
      SELECT eb.booking_id FROM public.equipment_bookings eb
      WHERE eb.equipment_id = e.id
        AND tstzrange(eb.starts_at, eb.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
        AND (p_exclude_booking_id IS NULL OR eb.booking_id != p_exclude_booking_id)
      LIMIT 1
    ) AS conflict_booking_id
  FROM public.equipment e
  WHERE e.id = ANY(p_equipment_ids)
$$;


ALTER FUNCTION "public"."check_equipment_availability"("p_equipment_ids" "uuid"[], "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exclude_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Tylko dla UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Sprawdź czy wersja się zgadza
    -- OLD.version to wersja w bazie
    -- NEW.version to wersja którą wysłał user
    IF OLD.version != NEW.version THEN
      RAISE EXCEPTION 'Record has been modified by another user (expected version %, got %)', 
        OLD.version, NEW.version
        USING ERRCODE = 'P0001';
    END IF;
    
    -- Zwiększ wersję
    NEW.version := OLD.version + 1;
    
    -- Zaktualizuj timestamp
    NEW.updated_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_version"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "booking_date" "date" NOT NULL,
    "booking_time" time without time zone NOT NULL,
    "duration" integer NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "payment_method" "text",
    "base_price" numeric(10,2) NOT NULL,
    "surcharge" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_price" numeric(10,2) GENERATED ALWAYS AS (("base_price" + "surcharge")) STORED,
    "notes" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "deleted_by" "uuid",
    "reminder_sent" boolean DEFAULT false NOT NULL,
    "survey_sent" boolean DEFAULT false NOT NULL,
    "pre_form_sent" boolean DEFAULT false NOT NULL,
    CONSTRAINT "bookings_base_price_check" CHECK (("base_price" >= (0)::numeric)),
    CONSTRAINT "bookings_date_future_check" CHECK (("booking_date" <= (CURRENT_DATE + '1 year'::interval))),
    CONSTRAINT "bookings_duration_check" CHECK (("duration" > 0)),
    CONSTRAINT "bookings_payment_method_check" CHECK ((("payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'transfer'::"text", 'other'::"text"])) OR ("payment_method" IS NULL))),
    CONSTRAINT "bookings_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'booksy'::"text", 'api'::"text", 'website'::"text"]))),
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text", 'no_show'::"text", 'scheduled'::"text"]))),
    CONSTRAINT "bookings_surcharge_check" CHECK (("surcharge" >= (0)::numeric))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


COMMENT ON TABLE "public"."bookings" IS 'Service bookings and appointments';



CREATE OR REPLACE FUNCTION "public"."create_booking_atomic"("p_salon_id" "uuid", "p_employee_id" "uuid", "p_client_id" "uuid", "p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone, "p_duration" integer, "p_base_price" numeric, "p_notes" "text", "p_status" "text", "p_created_by" "uuid", "p_source" "text") RETURNS SETOF "public"."bookings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM 1
  FROM bookings
  WHERE employee_id = p_employee_id
    AND booking_date = p_booking_date
    AND booking_time = p_booking_time
    AND status != 'cancelled'
    AND deleted_at IS NULL
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = '23P01';
  END IF;

  RETURN QUERY
  INSERT INTO bookings (
    salon_id,
    employee_id,
    client_id,
    service_id,
    booking_date,
    booking_time,
    duration,
    base_price,
    notes,
    status,
    created_by,
    source
  )
  VALUES (
    p_salon_id,
    p_employee_id,
    p_client_id,
    p_service_id,
    p_booking_date,
    p_booking_time,
    p_duration,
    p_base_price,
    p_notes,
    p_status,
    p_created_by,
    p_source
  )
  RETURNING *;
END;
$$;


ALTER FUNCTION "public"."create_booking_atomic"("p_salon_id" "uuid", "p_employee_id" "uuid", "p_client_id" "uuid", "p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone, "p_duration" integer, "p_base_price" numeric, "p_notes" "text", "p_status" "text", "p_created_by" "uuid", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_apply_completed_booking_to_client"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  booking_total NUMERIC(10,2);
  booking_visit_at TIMESTAMPTZ;
  applied_booking_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'booksy' THEN
      -- Booksy bookings are already confirmed; skip only if cancelled/no_show
      IF NEW.status IN ('cancelled', 'no_show') THEN RETURN NEW; END IF;
      -- else fall through to increment
    ELSIF NEW.status <> 'completed' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'completed' OR COALESCE(OLD.status, '') = 'completed' THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  booking_total := COALESCE(NEW.total_price, NEW.base_price + COALESCE(NEW.surcharge, 0), 0);
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


ALTER FUNCTION "public"."crm_apply_completed_booking_to_client"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_increment_campaign_counter"("p_campaign_id" "uuid", "p_counter_name" "text", "p_increment_by" integer DEFAULT 1) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_increment_by IS NULL OR p_increment_by <= 0 THEN
    RETURN;
  END IF;

  IF p_counter_name = 'sent_count' THEN
    UPDATE public.crm_campaigns
    SET sent_count = COALESCE(sent_count, 0) + p_increment_by
    WHERE id = p_campaign_id;
  ELSIF p_counter_name = 'failed_count' THEN
    UPDATE public.crm_campaigns
    SET failed_count = COALESCE(failed_count, 0) + p_increment_by
    WHERE id = p_campaign_id;
  ELSE
    RAISE EXCEPTION 'Unsupported campaign counter: %', p_counter_name;
  END IF;
END;
$$;


ALTER FUNCTION "public"."crm_increment_campaign_counter"("p_campaign_id" "uuid", "p_counter_name" "text", "p_increment_by" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_increment_usage_counter"("p_salon_id" "uuid", "p_period_month" "text", "p_channel" "text", "p_increment_by" integer DEFAULT 1) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_increment_by IS NULL OR p_increment_by <= 0 THEN
    RETURN;
  END IF;

  IF p_channel NOT IN ('email', 'sms') THEN
    RAISE EXCEPTION 'Unsupported usage channel: %', p_channel;
  END IF;

  INSERT INTO public.usage_tracking (
    salon_id,
    period_month,
    bookings_count,
    clients_count,
    employees_count,
    api_calls_count,
    emails_sent_count,
    sms_sent_count,
    emails_limit_exceeded,
    sms_limit_exceeded
  )
  VALUES (
    p_salon_id,
    p_period_month,
    0,
    0,
    0,
    0,
    CASE WHEN p_channel = 'email' THEN p_increment_by ELSE 0 END,
    CASE WHEN p_channel = 'sms' THEN p_increment_by ELSE 0 END,
    false,
    false
  )
  ON CONFLICT (salon_id, period_month)
  DO UPDATE
  SET
    emails_sent_count = usage_tracking.emails_sent_count + CASE WHEN p_channel = 'email' THEN p_increment_by ELSE 0 END,
    sms_sent_count = usage_tracking.sms_sent_count + CASE WHEN p_channel = 'sms' THEN p_increment_by ELSE 0 END,
    emails_limit_exceeded = CASE WHEN p_channel = 'email' THEN false ELSE usage_tracking.emails_limit_exceeded END,
    sms_limit_exceeded = CASE WHEN p_channel = 'sms' THEN false ELSE usage_tracking.sms_limit_exceeded END;
END;
$$;


ALTER FUNCTION "public"."crm_increment_usage_counter"("p_salon_id" "uuid", "p_period_month" "text", "p_channel" "text", "p_increment_by" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_sms_balance"("p_salon_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  affected_rows INT := 0;
BEGIN
  UPDATE public.sms_wallet
  SET balance = balance - 1,
      updated_at = now()
  WHERE salon_id = p_salon_id
    AND balance > 0;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows = 1;
END;
$$;


ALTER FUNCTION "public"."decrement_sms_balance"("p_salon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_client_code"("salon_uuid" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    next_num INTEGER;
    new_code TEXT;
BEGIN
    -- Get the highest existing client number for this salon
    SELECT COALESCE(
        MAX(
            CAST(
                SUBSTRING(client_code FROM 2) AS INTEGER
            )
        ), 0
    ) INTO next_num
    FROM public.clients
    WHERE salon_id = salon_uuid;
    
    -- Increment and format
    next_num := next_num + 1;
    new_code := 'C' || LPAD(next_num::TEXT, 3, '0');
    
    RETURN new_code;
END;
$$;


ALTER FUNCTION "public"."generate_client_code"("salon_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_employee_code"("salon_uuid" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    next_num INTEGER;
    new_code TEXT;
BEGIN
    -- Get the highest existing employee number for this salon
    SELECT COALESCE(
        MAX(
            CAST(
                SUBSTRING(employee_code FROM 2) AS INTEGER
            )
        ), 0
    ) INTO next_num
    FROM public.employees
    WHERE salon_id = salon_uuid;
    
    -- Increment and format
    next_num := next_num + 1;
    new_code := 'E' || LPAD(next_num::TEXT, 3, '0');
    
    RETURN new_code;
END;
$$;


ALTER FUNCTION "public"."generate_employee_code"("salon_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."generate_invoice_number"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_invoice_number"() IS 'Generuje unikalny numer faktury w formacie INV-YYYY-NNNNNN';



CREATE OR REPLACE FUNCTION "public"."get_user_employee_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE emp_id UUID;
user_salon_id UUID;
BEGIN user_salon_id := public.get_user_salon_id();
IF user_salon_id IS NULL THEN RETURN NULL;
END IF;
SELECT id INTO emp_id
FROM public.employees
WHERE user_id = auth.uid()
  AND salon_id = user_salon_id
  AND deleted_at IS NULL
LIMIT 1;
RETURN emp_id;
END;
$$;


ALTER FUNCTION "public"."get_user_employee_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_employee_id"() IS 'Zwraca employee_id dla aktualnie zalogowanego użytkownika (jeśli jest pracownikiem). Wymaga kolumny employees.user_id.';



CREATE OR REPLACE FUNCTION "public"."get_user_salon_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE jwt_salon_id TEXT;
profile_salon_id UUID;
BEGIN -- 1. Try JWT (Custom Claims)
BEGIN jwt_salon_id := current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'salon_id';
EXCEPTION
WHEN OTHERS THEN jwt_salon_id := NULL;
END;
IF jwt_salon_id IS NOT NULL THEN RETURN jwt_salon_id::UUID;
END IF;
SELECT salon_id INTO profile_salon_id
FROM public.profiles
WHERE user_id = auth.uid()
LIMIT 1;
RETURN profile_salon_id;
END;
$$;


ALTER FUNCTION "public"."get_user_salon_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_salon_id"() IS 'Optimized helper to get salon_id from JWT or DB.';



CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_any_salon_role"("required_roles" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE jwt_role TEXT;
db_role TEXT;
user_salon_id UUID;
BEGIN -- 1. JWT Check
BEGIN jwt_role := current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role';
EXCEPTION
WHEN OTHERS THEN jwt_role := NULL;
END;
IF jwt_role IS NOT NULL THEN RETURN jwt_role = ANY(required_roles);
END IF;
user_salon_id := public.get_user_salon_id();
IF user_salon_id IS NULL THEN RETURN FALSE;
END IF;
SELECT role INTO db_role
FROM public.profiles
WHERE user_id = auth.uid()
    AND salon_id = user_salon_id
LIMIT 1;
RETURN db_role = ANY(required_roles);
END;
$$;


ALTER FUNCTION "public"."has_any_salon_role"("required_roles" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_any_salon_role"("required_roles" "text"[]) IS 'Optimized helper to check multiple roles from JWT or DB.';



CREATE OR REPLACE FUNCTION "public"."has_salon_role"("required_role" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE jwt_role TEXT;
db_role TEXT;
user_salon_id UUID;
BEGIN -- 1. JWT Check
BEGIN jwt_role := current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role';
EXCEPTION
WHEN OTHERS THEN jwt_role := NULL;
END;
IF jwt_role IS NOT NULL THEN RETURN jwt_role = required_role;
END IF;
user_salon_id := public.get_user_salon_id();
IF user_salon_id IS NULL THEN RETURN FALSE;
END IF;
SELECT role INTO db_role
FROM public.profiles
WHERE user_id = auth.uid()
    AND salon_id = user_salon_id
LIMIT 1;
RETURN db_role = required_role;
END;
$$;


ALTER FUNCTION "public"."has_salon_role"("required_role" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_salon_role"("required_role" "text") IS 'Optimized helper to check role from JWT or DB.';



CREATE OR REPLACE FUNCTION "public"."increment_client_no_show"("p_client_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.clients
  SET no_show_count = COALESCE(no_show_count, 0) + 1
  WHERE id = p_client_id;
$$;


ALTER FUNCTION "public"."increment_client_no_show"("p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_client_visits"("client_uuid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE public.clients
    SET visit_count = visit_count + 1,
        updated_at = NOW()
    WHERE id = client_uuid;
END;
$$;


ALTER FUNCTION "public"."increment_client_visits"("client_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_employee_to_user_by_email"("employee_uuid" "uuid", "user_email" "text") RETURNS TABLE("employee_id" "uuid", "user_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  target_user_id UUID;
  employee_record public.employees%ROWTYPE;
  profile_record public.profiles%ROWTYPE;
  normalized_email TEXT;
  full_name_value TEXT;
BEGIN
  IF user_email IS NULL OR length(trim(user_email)) = 0 THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF NOT public.has_any_salon_role(ARRAY['owner', 'manager']) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO employee_record FROM public.employees WHERE id = employee_uuid AND deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;

  IF employee_record.salon_id != public.get_user_salon_id() THEN
    RAISE EXCEPTION 'Employee belongs to a different salon';
  END IF;

  normalized_email := lower(trim(user_email));

  SELECT u.id INTO target_user_id FROM auth.users u WHERE lower(u.email) = normalized_email LIMIT 1;

  IF target_user_id IS NULL THEN RAISE EXCEPTION 'User with this email not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = target_user_id AND e.id <> employee_uuid) THEN
    RAISE EXCEPTION 'User already linked to another employee';
  END IF;

  UPDATE public.employees SET user_id = target_user_id WHERE id = employee_uuid;

  SELECT p.*
  INTO profile_record
  FROM public.profiles p
  WHERE p.user_id = target_user_id;

  IF NOT FOUND THEN
    full_name_value := trim(coalesce(employee_record.first_name, '') || ' ' || coalesce(employee_record.last_name, ''));
    IF full_name_value IS NULL OR length(full_name_value) = 0 THEN full_name_value := normalized_email; END IF;
    INSERT INTO public.profiles (user_id, salon_id, role, full_name)
    VALUES (target_user_id, employee_record.salon_id, 'employee', full_name_value)
    RETURNING * INTO profile_record;
  ELSE
    IF profile_record.salon_id <> employee_record.salon_id THEN
      RAISE EXCEPTION 'User belongs to a different salon';
    END IF;
  END IF;

  RETURN QUERY SELECT employee_record.id, target_user_id;
END;
$$;


ALTER FUNCTION "public"."link_employee_to_user_by_email"("employee_uuid" "uuid", "user_email" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."link_employee_to_user_by_email"("employee_uuid" "uuid", "user_email" "text") IS 'Links employees.user_id to auth.users.id by email. Requires OWNER or MANAGER and same salon.';



CREATE OR REPLACE FUNCTION "public"."seed_default_crm_templates"("p_salon_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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

Aby zrezygnować z wiadomości: {{unsubscribe_link}}',
    NULL
  )

  ON CONFLICT DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."seed_default_crm_templates"("p_salon_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."seed_default_crm_templates"("p_salon_id" "uuid") IS 'Seeduje 4 domyślne szablony CRM dla nowego lub istniejącego salonu. Bezpieczne do wielokrotnego wywołania (ON CONFLICT DO NOTHING).';



CREATE OR REPLACE FUNCTION "public"."set_invoice_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_invoice_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ BEGIN NEW.updated_at = now();
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Zamiast DELETE, robimy UPDATE
  UPDATE bookings 
  SET 
    deleted_at = NOW(),
    deleted_by = auth.uid() -- Funkcja Supabase zwracająca aktualnego usera
  WHERE id = OLD.id;
  
  -- Zwróć NULL żeby zapobiec faktycznemu DELETE
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."soft_delete_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_client"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE clients 
  SET 
    deleted_at = NOW(),
    deleted_by = auth.uid()
  WHERE id = OLD.id;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."soft_delete_client"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_employee"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$ BEGIN
UPDATE employees
SET deleted_at = NOW(),
    deleted_by = auth.uid()
WHERE id = OLD.id;
RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."soft_delete_employee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_service"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE services 
  SET 
    deleted_at = NOW(),
    deleted_by = auth.uid()
  WHERE id = OLD.id;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."soft_delete_service"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_subscription_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."sync_subscription_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_claims"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_permissions JSONB;
BEGIN
  v_permissions := CASE NEW.role
    WHEN 'owner' THEN '["*"]'::jsonb
    WHEN 'manager' THEN '["calendar:view","calendar:manage_all","clients:view","clients:manage","employees:manage","services:manage","finance:view","reports:view","settings:view"]'::jsonb
    WHEN 'employee' THEN '["calendar:view","calendar:manage_own","clients:view","services:view"]'::jsonb
    ELSE '[]'::jsonb
  END;

  UPDATE auth.users
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'salon_id', NEW.salon_id,
      'role', NEW.role,
      'permissions', v_permissions
    )
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_user_claims"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_user_claims"() IS 'Synchronizes public.profiles data to auth.users.raw_app_meta_data, including RBAC permissions.';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "changed_by" "uuid" DEFAULT "auth"."uid"(),
    "changed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beauty_plan_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "booking_id" "uuid",
    "planned_date" "date",
    "notes" "text",
    "step_order" integer NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."beauty_plan_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beauty_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "beauty_plans_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'abandoned'::"text"])))
);


ALTER TABLE "public"."beauty_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blacklist_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "no_show_threshold" integer DEFAULT 2 NOT NULL,
    "late_cancel_threshold" integer DEFAULT 3 NOT NULL,
    "window_months" integer DEFAULT 6 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "blacklist_settings_late_cancel_threshold_check" CHECK (("late_cancel_threshold" > 0)),
    CONSTRAINT "blacklist_settings_no_show_threshold_check" CHECK (("no_show_threshold" > 0)),
    CONSTRAINT "blacklist_settings_window_months_check" CHECK ((("window_months" >= 1) AND ("window_months" <= 24)))
);


ALTER TABLE "public"."blacklist_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booksy_pending_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "message_id" "text" NOT NULL,
    "subject" "text",
    "body_snippet" "text",
    "parsed_data" "jsonb",
    "failure_reason" "text" DEFAULT 'other'::"text" NOT NULL,
    "failure_detail" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "booksy_pending_emails_failure_reason_check" CHECK (("failure_reason" = ANY (ARRAY['parse_failed'::"text", 'service_not_found'::"text", 'employee_not_found'::"text", 'cancel_not_found'::"text", 'reschedule_not_found'::"text", 'other'::"text"]))),
    CONSTRAINT "booksy_pending_emails_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'resolved'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."booksy_pending_emails" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booksy_sync_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "triggered_by" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    "emails_found" integer DEFAULT 0 NOT NULL,
    "emails_success" integer DEFAULT 0 NOT NULL,
    "emails_error" integer DEFAULT 0 NOT NULL,
    "sync_results" "jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booksy_sync_logs_triggered_by_check" CHECK (("triggered_by" = ANY (ARRAY['cron'::"text", 'manual'::"text", 'webhook'::"text"])))
);


ALTER TABLE "public"."booksy_sync_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_forms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "form_template_id" "uuid" NOT NULL,
    "answers" "bytea" NOT NULL,
    "answers_iv" "bytea" NOT NULL,
    "answers_tag" "bytea" NOT NULL,
    "signature_url" "text",
    "signed_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "fill_token" "text",
    "fill_token_exp" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "health_consent_at" timestamp with time zone
);


ALTER TABLE "public"."client_forms" OWNER TO "postgres";


COMMENT ON COLUMN "public"."client_forms"."health_consent_at" IS 'Timestamp of explicit health data consent per GDPR Art. 9(2)(a). Required when form_template.data_category is health or sensitive_health. Null for general templates or where consent was not yet collected.';



CREATE TABLE IF NOT EXISTS "public"."client_violations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "violation_type" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_violations_violation_type_check" CHECK (("violation_type" = ANY (ARRAY['no_show'::"text", 'late_cancel'::"text"])))
);


ALTER TABLE "public"."client_violations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "client_code" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text",
    "notes" "text",
    "visit_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "deleted_by" "uuid",
    "last_visit_at" timestamp with time zone,
    "total_spent" numeric(10,2) DEFAULT 0,
    "birthday" "date",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "sms_opt_in" boolean DEFAULT true,
    "email_opt_in" boolean DEFAULT true,
    "blacklist_status" "text" DEFAULT 'clean'::"text" NOT NULL,
    "no_show_count" integer DEFAULT 0 NOT NULL,
    "blacklisted_at" timestamp with time zone,
    "blacklist_reason" "text",
    CONSTRAINT "clients_blacklist_status_check" CHECK (("blacklist_status" = ANY (ARRAY['clean'::"text", 'warned'::"text", 'blacklisted'::"text"]))),
    CONSTRAINT "clients_email_format" CHECK ((("email" IS NULL) OR ("email" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'::"text"))),
    CONSTRAINT "clients_full_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "full_name")) > 0)),
    CONSTRAINT "clients_phone_format" CHECK (("phone" ~ '^\+?[0-9]{9,15}$'::"text"))
);

ALTER TABLE ONLY "public"."clients" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON TABLE "public"."clients" IS 'Salon clients with contact information';



CREATE TABLE IF NOT EXISTS "public"."crm_automations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "trigger_type" "text" NOT NULL,
    "trigger_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "channel" "text" NOT NULL,
    "template_id" "uuid",
    "last_run_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "crm_automations_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'both'::"text"]))),
    CONSTRAINT "crm_automations_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['no_visit_days'::"text", 'birthday'::"text", 'after_visit'::"text", 'visit_count'::"text"])))
);


ALTER TABLE "public"."crm_automations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "channel" "text" NOT NULL,
    "template_id" "uuid",
    "automation_id" "uuid",
    "segment_filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "recipient_count" integer DEFAULT 0,
    "sent_count" integer DEFAULT 0,
    "failed_count" integer DEFAULT 0,
    "qstash_message_id" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "crm_campaigns_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'both'::"text"]))),
    CONSTRAINT "crm_campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'sending'::"text", 'sent'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."crm_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_completed_booking_applications" (
    "booking_id" "uuid" NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."crm_completed_booking_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_schedule_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "exception_date" "date" NOT NULL,
    "is_working" boolean DEFAULT false NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_exceptions_times_check" CHECK ((("is_working" = false) OR (("start_time" IS NOT NULL) AND ("end_time" IS NOT NULL) AND ("end_time" > "start_time"))))
);


ALTER TABLE "public"."employee_schedule_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "is_working" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "employee_schedules_times_check" CHECK (("end_time" > "start_time"))
);


ALTER TABLE "public"."employee_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "employee_code" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "base_threshold" numeric(10,2) DEFAULT 0 NOT NULL,
    "base_salary" numeric(10,2) DEFAULT 0 NOT NULL,
    "commission_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "deleted_by" "uuid",
    "user_id" "uuid",
    "avatar_url" "text",
    CONSTRAINT "chk_commission_rate" CHECK ((("commission_rate" >= (0)::numeric) AND ("commission_rate" <= (1)::numeric))),
    CONSTRAINT "employees_commission_rate_check" CHECK ((("commission_rate" >= (0)::numeric) AND ("commission_rate" <= (100)::numeric))),
    CONSTRAINT "employees_email_format" CHECK ((("email" IS NULL) OR ("email" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'::"text"))),
    CONSTRAINT "employees_phone_format" CHECK (("phone" ~ '^\+?[0-9]{9,15}$'::"text"))
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


COMMENT ON TABLE "public"."employees" IS 'Salon employees with commission structure';



COMMENT ON COLUMN "public"."employees"."user_id" IS 'Reference to auth.users - links employee record to authenticated user account. NULL if employee does not have login access.';



CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'other'::"text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipment_type_check" CHECK (("type" = ANY (ARRAY['laser'::"text", 'fotel'::"text", 'stol_manicure'::"text", 'fotopolimeryzator'::"text", 'inne'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."equipment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    CONSTRAINT "chk_equipment_booking_time" CHECK (("ends_at" > "starts_at"))
);


ALTER TABLE "public"."equipment_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "feature_name" "text" NOT NULL,
    "enabled" boolean DEFAULT false,
    "limit_value" integer,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feature_flags" OWNER TO "postgres";


COMMENT ON TABLE "public"."feature_flags" IS 'Feature gating - kontrola dostępu do funkcjonalności w zależności od planu';



CREATE TABLE IF NOT EXISTS "public"."form_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "requires_signature" boolean DEFAULT false NOT NULL,
    "gdpr_consent_text" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_category" "public"."form_data_category" DEFAULT 'general'::"public"."form_data_category" NOT NULL
);


ALTER TABLE "public"."form_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."form_templates"."data_category" IS 'GDPR data sensitivity classification. general = no special category data. health = health-related fields (Art. 9 applies). sensitive_health = special category data requiring explicit consent per Art. 9(2)(a).';



CREATE TABLE IF NOT EXISTS "public"."health_data_access_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "accessed_by" "uuid" NOT NULL,
    "accessed_by_role" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "data_category" "text" NOT NULL,
    "action" "text" NOT NULL,
    "accessed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    CONSTRAINT "health_data_access_logs_action_check" CHECK (("action" = ANY (ARRAY['decrypt'::"text", 'view'::"text", 'export'::"text"]))),
    CONSTRAINT "health_data_access_logs_data_category_check" CHECK (("data_category" = ANY (ARRAY['health'::"text", 'sensitive_health'::"text"]))),
    CONSTRAINT "health_data_access_logs_resource_type_check" CHECK (("resource_type" = ANY (ARRAY['form_response'::"text", 'treatment_record'::"text", 'treatment_photo'::"text"])))
);


ALTER TABLE "public"."health_data_access_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."health_data_access_logs" IS 'Append-only log for auditing access to sensitive client health data.';



COMMENT ON COLUMN "public"."health_data_access_logs"."salon_id" IS 'The salon where the access occurred.';



COMMENT ON COLUMN "public"."health_data_access_logs"."accessed_by" IS 'The user who accessed the data.';



COMMENT ON COLUMN "public"."health_data_access_logs"."accessed_by_role" IS 'The role of the user at the time of access.';



COMMENT ON COLUMN "public"."health_data_access_logs"."resource_type" IS 'The type of resource that was accessed.';



COMMENT ON COLUMN "public"."health_data_access_logs"."resource_id" IS 'The unique identifier of the accessed resource.';



COMMENT ON COLUMN "public"."health_data_access_logs"."client_id" IS 'The client whose data was accessed.';



COMMENT ON COLUMN "public"."health_data_access_logs"."data_category" IS 'The classification of the accessed data.';



COMMENT ON COLUMN "public"."health_data_access_logs"."action" IS 'The action performed on the data (e.g., decrypt, view, export).';



COMMENT ON COLUMN "public"."health_data_access_logs"."accessed_at" IS 'The timestamp when the access occurred.';



COMMENT ON COLUMN "public"."health_data_access_logs"."ip_address" IS 'The IP address from which the access was made.';



COMMENT ON COLUMN "public"."health_data_access_logs"."user_agent" IS 'The user agent of the client that made the request.';



CREATE TABLE IF NOT EXISTS "public"."integration_configs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "integration_type" character varying(50) NOT NULL,
    "is_active" boolean DEFAULT false,
    "credentials" "jsonb",
    "settings" "jsonb",
    "last_sync_at" timestamp without time zone,
    "sync_status" character varying(20),
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."integration_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "invoice_number" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "subtotal_cents" integer NOT NULL,
    "tax_cents" integer DEFAULT 0,
    "total_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'PLN'::"text" NOT NULL,
    "billing_name" "text" NOT NULL,
    "billing_email" "text" NOT NULL,
    "billing_address" "jsonb",
    "payment_method" "text",
    "paid_at" timestamp with time zone,
    "due_date" timestamp with time zone,
    "p24_transaction_id" "text",
    "p24_order_id" "text",
    "pdf_url" "text",
    "line_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "invoices_amounts_positive" CHECK (("total_cents" > 0)),
    CONSTRAINT "invoices_amounts_valid" CHECK (("total_cents" = ("subtotal_cents" + "tax_cents"))),
    CONSTRAINT "invoices_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['card'::"text", 'transfer'::"text", 'blik'::"text", 'p24'::"text"]))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'paid'::"text", 'void'::"text", 'uncollectible'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


COMMENT ON TABLE "public"."invoices" IS 'Faktury VAT dla płatności subskrypcji';



COMMENT ON COLUMN "public"."invoices"."invoice_number" IS 'Unikalny numer faktury (generowany automatycznie)';



COMMENT ON COLUMN "public"."invoices"."line_items" IS 'JSON array z pozycjami: [{ description, quantity, unit_price, total }]';



CREATE TABLE IF NOT EXISTS "public"."message_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "automation_id" "uuid",
    "client_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "recipient" "text" NOT NULL,
    "subject" "text",
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider_id" "text",
    "error" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "message_logs_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text"]))),
    CONSTRAINT "message_logs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'delivered'::"text", 'failed'::"text", 'bounced'::"text"])))
);


ALTER TABLE "public"."message_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "subject" "text",
    "body" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "message_templates_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."message_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "card_brand" "text",
    "card_last4" "text",
    "card_exp_month" integer,
    "card_exp_year" integer,
    "is_default" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "p24_payment_method_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payment_methods_card_details_required" CHECK ((("type" <> 'card'::"text") OR (("card_brand" IS NOT NULL) AND ("card_last4" IS NOT NULL)))),
    CONSTRAINT "payment_methods_card_exp_month_check" CHECK ((("card_exp_month" >= 1) AND ("card_exp_month" <= 12))),
    CONSTRAINT "payment_methods_card_exp_year_check" CHECK (("card_exp_year" >= 2024)),
    CONSTRAINT "payment_methods_type_check" CHECK (("type" = ANY (ARRAY['card'::"text", 'bank_transfer'::"text", 'blik'::"text"])))
);


ALTER TABLE "public"."payment_methods" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_methods" IS 'Zapisane metody płatności salonu (tokenizowane przez Przelewy24)';



CREATE TABLE IF NOT EXISTS "public"."payroll_entries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "payroll_run_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "visit_count" integer NOT NULL,
    "total_revenue" numeric(10,2) NOT NULL,
    "base_threshold" numeric(10,2) NOT NULL,
    "base_salary" numeric(10,2) NOT NULL,
    "commission_rate" numeric(5,2) NOT NULL,
    "commission_amount" numeric(10,2) NOT NULL,
    "total_payout" numeric(10,2) GENERATED ALWAYS AS (("base_salary" + "commission_amount")) STORED,
    "pdf_url" "text",
    "email_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payroll_entries" OWNER TO "postgres";


COMMENT ON TABLE "public"."payroll_entries" IS 'Individual employee payroll calculations';



CREATE TABLE IF NOT EXISTS "public"."payroll_runs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "period_month" "text" NOT NULL,
    "total_revenue" numeric(10,2) NOT NULL,
    "total_payroll" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "generated_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "payroll_runs_dates_check" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "payroll_runs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'finalized'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."payroll_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."payroll_runs" IS 'Payroll calculation runs for specific periods';



CREATE TABLE IF NOT EXISTS "public"."pre_appointment_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "form_template_id" "text" DEFAULT 'pre_appointment'::"text" NOT NULL,
    "answers" "jsonb",
    "fill_token" "text",
    "fill_token_exp" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pre_appointment_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" DEFAULT 'staff'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'employee'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'User profiles with salon associations and roles';



CREATE TABLE IF NOT EXISTS "public"."reminder_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "hours_before" integer NOT NULL,
    "message_template" "text" NOT NULL,
    "require_confirmation" boolean DEFAULT true NOT NULL,
    "target_blacklisted_only" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reminder_rules_hours_before_check" CHECK (("hours_before" > 0))
);


ALTER TABLE "public"."reminder_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salon_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "integration_type" character varying(50) NOT NULL,
    "gmail_email" character varying(255),
    "access_token" "text",
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "last_sync_at" timestamp with time zone,
    "sync_status" character varying(50) DEFAULT 'idle'::character varying,
    "sync_error" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."salon_integrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."salon_integrations" IS 'Stores OAuth tokens and configuration for third-party integrations like Gmail/Booksy';



CREATE TABLE IF NOT EXISTS "public"."salon_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "theme" character varying(50) DEFAULT 'beauty_salon'::character varying,
    "custom_colors" "jsonb",
    "logo_url" "text",
    "font_family" character varying(100) DEFAULT 'Inter'::character varying,
    "business_type" character varying(50) DEFAULT 'beauty_salon'::character varying,
    "description" "text",
    "contact_phone" character varying(20),
    "contact_email" character varying(255),
    "website_url" "text",
    "address" "jsonb",
    "operating_hours" "jsonb" DEFAULT '{"friday": {"open": "09:00", "close": "18:00", "closed": false}, "monday": {"open": "09:00", "close": "18:00", "closed": false}, "sunday": {"open": null, "close": null, "closed": true}, "tuesday": {"open": "09:00", "close": "18:00", "closed": false}, "saturday": {"open": "10:00", "close": "16:00", "closed": false}, "thursday": {"open": "09:00", "close": "18:00", "closed": false}, "wednesday": {"open": "09:00", "close": "18:00", "closed": false}}'::"jsonb" NOT NULL,
    "closures" "jsonb" DEFAULT '[]'::"jsonb",
    "booking_window_days" integer DEFAULT 30,
    "min_notice_hours" integer DEFAULT 2,
    "slot_duration_minutes" integer DEFAULT 15,
    "allow_waitlist" boolean DEFAULT false,
    "require_deposit" boolean DEFAULT false,
    "deposit_amount" numeric(10,2),
    "currency" character varying(3) DEFAULT 'PLN'::character varying,
    "language" character varying(2) DEFAULT 'pl'::character varying,
    "timezone" character varying(50) DEFAULT 'Europe/Warsaw'::character varying,
    "notification_settings" "jsonb" DEFAULT '{"newBooking": {"enabled": true, "channels": ["email"]}, "cancellation": {"enabled": true, "channels": ["email"]}, "dailySummary": {"time": "08:00", "enabled": false, "recipients": []}, "clientReminders": {"timing": [24, 2], "enabled": true, "channels": ["sms", "email"]}, "clientConfirmations": {"enabled": true, "channels": ["email"]}}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "booksy_enabled" boolean DEFAULT false,
    "booksy_gmail_email" "text",
    "booksy_gmail_tokens" "jsonb",
    "accounting_email" "text",
    "booksy_sync_interval_minutes" integer DEFAULT 15,
    "booksy_sender_filter" "text" DEFAULT 'noreply@booksy.com'::"text",
    "booksy_auto_create_clients" boolean DEFAULT true,
    "booksy_auto_create_services" boolean DEFAULT false,
    "booksy_notify_on_new" boolean DEFAULT false,
    "booksy_notify_on_cancel" boolean DEFAULT false,
    "booksy_notify_email" "text",
    "booksy_last_sync_at" timestamp with time zone,
    "booksy_sync_stats" "jsonb" DEFAULT '{"total": 0, "errors": 0, "success": 0}'::"jsonb",
    "resend_api_key" "text",
    "resend_from_email" "text",
    "resend_from_name" "text",
    "smsapi_token" "text",
    "smsapi_sender_name" "text",
    "p24_merchant_id" "text",
    "p24_pos_id" "text",
    "p24_crc" "text",
    "p24_api_key" "text",
    "p24_api_url" "text" DEFAULT 'https://secure.przelewy24.pl'::"text",
    "p24_sandbox_mode" boolean DEFAULT false,
    "sms_provider" "text" DEFAULT 'smsapi'::"text" NOT NULL,
    "bulkgate_app_id" "text",
    "bulkgate_app_token" "text",
    CONSTRAINT "salon_settings_sms_provider_check" CHECK (("sms_provider" = ANY (ARRAY['smsapi'::"text", 'bulkgate'::"text"])))
);


ALTER TABLE "public"."salon_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."salon_settings"."accounting_email" IS 'Email address specifically for payroll and accounting summaries.';



COMMENT ON COLUMN "public"."salon_settings"."booksy_sync_interval_minutes" IS 'How often (in minutes) to check for new Booksy emails via cron';



COMMENT ON COLUMN "public"."salon_settings"."booksy_sender_filter" IS 'Email address filter for Booksy notification emails (e.g. noreply@booksy.com)';



COMMENT ON COLUMN "public"."salon_settings"."booksy_auto_create_clients" IS 'Automatically create new clients from Booksy bookings if not found';



COMMENT ON COLUMN "public"."salon_settings"."booksy_auto_create_services" IS 'Automatically create new services from Booksy bookings if not found';



COMMENT ON COLUMN "public"."salon_settings"."booksy_notify_on_new" IS 'Send notification email when a new Booksy booking is processed';



COMMENT ON COLUMN "public"."salon_settings"."booksy_notify_on_cancel" IS 'Send notification email when a Booksy cancellation is processed';



COMMENT ON COLUMN "public"."salon_settings"."booksy_notify_email" IS 'Email address to send Booksy event notifications to';



COMMENT ON COLUMN "public"."salon_settings"."booksy_last_sync_at" IS 'Timestamp of the last successful Booksy sync';



COMMENT ON COLUMN "public"."salon_settings"."booksy_sync_stats" IS 'Cumulative stats: total, success, errors processed emails';



COMMENT ON COLUMN "public"."salon_settings"."p24_merchant_id" IS 'Przelewy24 Merchant ID salonu';



COMMENT ON COLUMN "public"."salon_settings"."p24_pos_id" IS 'Przelewy24 POS ID salonu';



COMMENT ON COLUMN "public"."salon_settings"."p24_crc" IS 'Przelewy24 CRC Key (zaszyfrowany AES-256-GCM)';



COMMENT ON COLUMN "public"."salon_settings"."p24_api_key" IS 'Przelewy24 API Key do REST (zaszyfrowany, opcjonalny — fallback na CRC)';



COMMENT ON COLUMN "public"."salon_settings"."p24_api_url" IS 'URL bramki P24 (secure lub sandbox)';



COMMENT ON COLUMN "public"."salon_settings"."p24_sandbox_mode" IS 'Tryb testowy (sandbox) Przelewy24';



CREATE TABLE IF NOT EXISTS "public"."salons" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "owner_email" "text" NOT NULL,
    "settings" "jsonb",
    "subscription_plan" "text" DEFAULT 'solo'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "trial_ends_at" timestamp with time zone,
    "subscription_started_at" timestamp with time zone,
    "billing_email" "text",
    "tax_id" "text",
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "salons_slug_format" CHECK (("slug" ~ '^[a-z0-9-]+$'::"text")),
    CONSTRAINT "salons_subscription_plan_check" CHECK (("subscription_plan" = ANY (ARRAY['solo'::"text", 'studio'::"text", 'clinic'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "salons_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'past_due'::"text", 'canceled'::"text", 'paused'::"text"]))),
    CONSTRAINT "salons_tax_id_format_check" CHECK ((("tax_id" IS NULL) OR (("tax_id" ~ '^\d{10}$'::"text") AND ("length"("tax_id") = 10))))
);


ALTER TABLE "public"."salons" OWNER TO "postgres";


COMMENT ON TABLE "public"."salons" IS 'Multi-tenant salon information';



COMMENT ON COLUMN "public"."salons"."trial_ends_at" IS 'Data zakończenia okresu próbnego (14 dni od rejestracji)';



COMMENT ON COLUMN "public"."salons"."subscription_started_at" IS 'Data rozpoczęcia płatnej subskrypcji';



COMMENT ON COLUMN "public"."salons"."billing_email" IS 'Email do faktur i powiadomień o płatnościach';



COMMENT ON COLUMN "public"."salons"."tax_id" IS 'NIP firmy (wymagany do faktur VAT)';



COMMENT ON COLUMN "public"."salons"."features" IS 'Feature flags: billing, equipment, medical_forms, sms_chat, blacklist, surveys';



CREATE TABLE IF NOT EXISTS "public"."satisfaction_surveys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "rating" integer,
    "nps_score" integer,
    "comment" "text",
    "fill_token" "text",
    "fill_token_exp" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service_id" "uuid",
    CONSTRAINT "satisfaction_surveys_nps_score_check" CHECK ((("nps_score" >= 0) AND ("nps_score" <= 10))),
    CONSTRAINT "satisfaction_surveys_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."satisfaction_surveys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_equipment" (
    "service_id" "uuid" NOT NULL,
    "equipment_id" "uuid" NOT NULL
);


ALTER TABLE "public"."service_equipment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_forms" (
    "service_id" "uuid" NOT NULL,
    "form_template_id" "uuid" NOT NULL
);


ALTER TABLE "public"."service_forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "subcategory" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "duration" integer NOT NULL,
    "surcharge_allowed" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "deleted_by" "uuid",
    "survey_enabled" boolean DEFAULT true NOT NULL,
    "survey_custom_message" "text",
    CONSTRAINT "services_duration_check" CHECK (("duration" > 0)),
    CONSTRAINT "services_duration_positive" CHECK (("duration" > 0)),
    CONSTRAINT "services_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "services_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "services_price_non_negative" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."services" OWNER TO "postgres";


COMMENT ON TABLE "public"."services" IS 'Services offered by the salon';



CREATE TABLE IF NOT EXISTS "public"."sms_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "direction" "text" NOT NULL,
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "provider_message_id" "text",
    "error_message" "text",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sms_messages_direction_check" CHECK (("direction" = ANY (ARRAY['outbound'::"text", 'inbound'::"text"]))),
    CONSTRAINT "sms_messages_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'delivered'::"text", 'failed'::"text", 'received'::"text"])))
);


ALTER TABLE "public"."sms_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sms_wallet" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sms_wallet_balance_check" CHECK (("balance" >= 0))
);


ALTER TABLE "public"."sms_wallet" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "plan_type" "text" NOT NULL,
    "billing_interval" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "current_period_start" timestamp with time zone NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "canceled_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'PLN'::"text" NOT NULL,
    "p24_transaction_id" "text",
    "p24_order_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "p24_token" "text",
    "dunning_attempt" integer DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp with time zone,
    CONSTRAINT "subscriptions_amount_positive" CHECK (("amount_cents" > 0)),
    CONSTRAINT "subscriptions_billing_interval_check" CHECK (("billing_interval" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "subscriptions_period_valid" CHECK (("current_period_end" > "current_period_start")),
    CONSTRAINT "subscriptions_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['solo'::"text", 'studio'::"text", 'clinic'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'past_due'::"text", 'canceled'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."subscriptions" IS 'Główna tabela subskrypcji - historia i status planów salonu';



COMMENT ON COLUMN "public"."subscriptions"."amount_cents" IS 'Kwota w groszach (np. 29900 = 299 PLN)';



COMMENT ON COLUMN "public"."subscriptions"."p24_transaction_id" IS 'ID transakcji z Przelewy24 (dla powiązania płatności)';



COMMENT ON COLUMN "public"."subscriptions"."p24_token" IS 'Tokenised card for recurring P24 charges';



COMMENT ON COLUMN "public"."subscriptions"."dunning_attempt" IS 'Failed payment retries, max 3';



COMMENT ON COLUMN "public"."subscriptions"."next_retry_at" IS 'Timestamp for next dunning attempt';



CREATE TABLE IF NOT EXISTS "public"."treatment_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "treatment_record_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "photo_type" "text" NOT NULL,
    "taken_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "treatment_photos_photo_type_check" CHECK (("photo_type" = ANY (ARRAY['before'::"text", 'after'::"text", 'during'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."treatment_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treatment_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "protocol_id" "uuid",
    "name" "text" NOT NULL,
    "total_sessions" integer NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "treatment_plans_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "treatment_plans_total_sessions_check" CHECK (("total_sessions" > 0))
);


ALTER TABLE "public"."treatment_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."treatment_plans" IS 'Stores plans for a series of treatments for a client.';



CREATE TABLE IF NOT EXISTS "public"."treatment_protocols" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."treatment_protocols" OWNER TO "postgres";


COMMENT ON TABLE "public"."treatment_protocols" IS 'Stores treatment protocols and forms for services.';



COMMENT ON COLUMN "public"."treatment_protocols"."fields" IS 'Array of form field definitions: { id: string, label: string, type: ''text''|''number''|''select''|''boolean'', options?: string[], required: boolean }';



CREATE TABLE IF NOT EXISTS "public"."treatment_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "client_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "performed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parameters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes_encrypted" "text",
    "data_category" "text" DEFAULT 'general'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "treatment_records_data_category_check" CHECK (("data_category" = ANY (ARRAY['general'::"text", 'health'::"text", 'sensitive_health'::"text"])))
);


ALTER TABLE "public"."treatment_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treatment_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "session_number" integer NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "booking_id" "uuid",
    "treatment_record_id" "uuid",
    "scheduled_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "treatment_sessions_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."treatment_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."treatment_sessions" IS 'Individual sessions within a treatment plan.';



CREATE TABLE IF NOT EXISTS "public"."usage_tracking" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "period_month" "text" NOT NULL,
    "bookings_count" integer DEFAULT 0,
    "clients_count" integer DEFAULT 0,
    "employees_count" integer DEFAULT 0,
    "api_calls_count" integer DEFAULT 0,
    "bookings_limit_exceeded" boolean DEFAULT false,
    "clients_limit_exceeded" boolean DEFAULT false,
    "employees_limit_exceeded" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "emails_sent_count" integer DEFAULT 0,
    "sms_sent_count" integer DEFAULT 0,
    "emails_limit_exceeded" boolean DEFAULT false,
    "sms_limit_exceeded" boolean DEFAULT false
);


ALTER TABLE "public"."usage_tracking" OWNER TO "postgres";


COMMENT ON TABLE "public"."usage_tracking" IS 'Tracking limitów użycia dla każdego salonu (miesięczne agregaty)';



COMMENT ON COLUMN "public"."usage_tracking"."period_month" IS 'Format YYYY-MM (np. "2026-02")';



CREATE TABLE IF NOT EXISTS "public"."webhook_replay_cache" (
    "event_id" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."webhook_replay_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."webhook_replay_cache" IS 'used for SMSAPI webhook replay protection';



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beauty_plan_steps"
    ADD CONSTRAINT "beauty_plan_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beauty_plans"
    ADD CONSTRAINT "beauty_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blacklist_settings"
    ADD CONSTRAINT "blacklist_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blacklist_settings"
    ADD CONSTRAINT "blacklist_settings_salon_id_key" UNIQUE ("salon_id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booksy_pending_emails"
    ADD CONSTRAINT "booksy_pending_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booksy_pending_emails"
    ADD CONSTRAINT "booksy_pending_emails_salon_id_message_id_key" UNIQUE ("salon_id", "message_id");



ALTER TABLE ONLY "public"."booksy_sync_logs"
    ADD CONSTRAINT "booksy_sync_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_forms"
    ADD CONSTRAINT "client_forms_fill_token_key" UNIQUE ("fill_token");



ALTER TABLE ONLY "public"."client_forms"
    ADD CONSTRAINT "client_forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_violations"
    ADD CONSTRAINT "client_violations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_salon_id_client_code_key" UNIQUE ("salon_id", "client_code");



ALTER TABLE ONLY "public"."crm_automations"
    ADD CONSTRAINT "crm_automations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_automations"
    ADD CONSTRAINT "crm_automations_salon_id_id_key" UNIQUE ("salon_id", "id");



ALTER TABLE ONLY "public"."crm_campaigns"
    ADD CONSTRAINT "crm_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_completed_booking_applications"
    ADD CONSTRAINT "crm_completed_booking_applications_pkey" PRIMARY KEY ("booking_id");



ALTER TABLE ONLY "public"."employee_schedule_exceptions"
    ADD CONSTRAINT "employee_exceptions_unique" UNIQUE ("employee_id", "exception_date");



ALTER TABLE ONLY "public"."employee_schedule_exceptions"
    ADD CONSTRAINT "employee_schedule_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_schedules"
    ADD CONSTRAINT "employee_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_schedules"
    ADD CONSTRAINT "employee_schedules_unique" UNIQUE ("employee_id", "day_of_week");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_salon_id_employee_code_key" UNIQUE ("salon_id", "employee_code");



ALTER TABLE ONLY "public"."equipment_bookings"
    ADD CONSTRAINT "equipment_bookings_equipment_id_tstzrange_excl" EXCLUDE USING "gist" ("equipment_id" WITH =, "tstzrange"("starts_at", "ends_at", '[)'::"text") WITH &&);



ALTER TABLE ONLY "public"."equipment_bookings"
    ADD CONSTRAINT "equipment_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_salon_id_feature_name_key" UNIQUE ("salon_id", "feature_name");



ALTER TABLE ONLY "public"."form_templates"
    ADD CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_data_access_logs"
    ADD CONSTRAINT "health_data_access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_configs"
    ADD CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_configs"
    ADD CONSTRAINT "integration_configs_salon_id_integration_type_key" UNIQUE ("salon_id", "integration_type");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_logs"
    ADD CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_payroll_run_id_employee_id_key" UNIQUE ("payroll_run_id", "employee_id");



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pre_appointment_responses"
    ADD CONSTRAINT "pre_appointment_responses_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."pre_appointment_responses"
    ADD CONSTRAINT "pre_appointment_responses_fill_token_key" UNIQUE ("fill_token");



ALTER TABLE ONLY "public"."pre_appointment_responses"
    ADD CONSTRAINT "pre_appointment_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_salon_id_key" UNIQUE ("user_id", "salon_id");



ALTER TABLE ONLY "public"."reminder_rules"
    ADD CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salon_integrations"
    ADD CONSTRAINT "salon_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salon_integrations"
    ADD CONSTRAINT "salon_integrations_salon_id_integration_type_key" UNIQUE ("salon_id", "integration_type");



ALTER TABLE ONLY "public"."salon_settings"
    ADD CONSTRAINT "salon_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salon_settings"
    ADD CONSTRAINT "salon_settings_salon_id_key" UNIQUE ("salon_id");



ALTER TABLE ONLY "public"."salons"
    ADD CONSTRAINT "salons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salons"
    ADD CONSTRAINT "salons_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."satisfaction_surveys"
    ADD CONSTRAINT "satisfaction_surveys_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."satisfaction_surveys"
    ADD CONSTRAINT "satisfaction_surveys_fill_token_key" UNIQUE ("fill_token");



ALTER TABLE ONLY "public"."satisfaction_surveys"
    ADD CONSTRAINT "satisfaction_surveys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_equipment"
    ADD CONSTRAINT "service_equipment_pkey" PRIMARY KEY ("service_id", "equipment_id");



ALTER TABLE ONLY "public"."service_forms"
    ADD CONSTRAINT "service_forms_pkey" PRIMARY KEY ("service_id", "form_template_id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sms_messages"
    ADD CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sms_wallet"
    ADD CONSTRAINT "sms_wallet_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sms_wallet"
    ADD CONSTRAINT "sms_wallet_salon_id_key" UNIQUE ("salon_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_photos"
    ADD CONSTRAINT "treatment_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_plans"
    ADD CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_protocols"
    ADD CONSTRAINT "treatment_protocols_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_records"
    ADD CONSTRAINT "treatment_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_sessions"
    ADD CONSTRAINT "treatment_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treatment_sessions"
    ADD CONSTRAINT "treatment_sessions_plan_id_session_number_key" UNIQUE ("plan_id", "session_number");



ALTER TABLE ONLY "public"."usage_tracking"
    ADD CONSTRAINT "usage_tracking_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_tracking"
    ADD CONSTRAINT "usage_tracking_salon_id_period_month_key" UNIQUE ("salon_id", "period_month");



ALTER TABLE ONLY "public"."webhook_replay_cache"
    ADD CONSTRAINT "webhook_replay_cache_pkey" PRIMARY KEY ("event_id");



CREATE INDEX "audit_logs_changed_at_idx" ON "public"."audit_logs" USING "btree" ("changed_at");



CREATE INDEX "audit_logs_salon_id_idx" ON "public"."audit_logs" USING "btree" ("salon_id");



CREATE INDEX "audit_logs_table_record_idx" ON "public"."audit_logs" USING "btree" ("table_name", "record_id");



CREATE INDEX "idx_beauty_plan_steps_plan_id" ON "public"."beauty_plan_steps" USING "btree" ("plan_id");



CREATE INDEX "idx_beauty_plans_client_id" ON "public"."beauty_plans" USING "btree" ("client_id");



CREATE INDEX "idx_bookings_client_id" ON "public"."bookings" USING "btree" ("client_id");



CREATE INDEX "idx_bookings_date" ON "public"."bookings" USING "btree" ("salon_id", "booking_date");



CREATE INDEX "idx_bookings_deleted_at" ON "public"."bookings" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_bookings_employee_date" ON "public"."bookings" USING "btree" ("employee_id", "booking_date");



CREATE INDEX "idx_bookings_employee_date_active" ON "public"."bookings" USING "btree" ("employee_id", "booking_date", "booking_time") WHERE ("status" <> ALL (ARRAY['cancelled'::"text", 'no_show'::"text"]));



CREATE INDEX "idx_bookings_employee_id" ON "public"."bookings" USING "btree" ("employee_id");



CREATE INDEX "idx_bookings_salon_client" ON "public"."bookings" USING "btree" ("salon_id", "client_id", "booking_date" DESC);



CREATE INDEX "idx_bookings_salon_date" ON "public"."bookings" USING "btree" ("salon_id", "booking_date", "booking_time");



CREATE INDEX "idx_bookings_salon_id" ON "public"."bookings" USING "btree" ("salon_id");



CREATE INDEX "idx_bookings_service_id" ON "public"."bookings" USING "btree" ("service_id");



CREATE INDEX "idx_bookings_status" ON "public"."bookings" USING "btree" ("salon_id", "status");



CREATE INDEX "idx_bookings_survey_sent" ON "public"."bookings" USING "btree" ("salon_id", "survey_sent") WHERE ("survey_sent" = false);



CREATE INDEX "idx_booksy_pending_salon_status" ON "public"."booksy_pending_emails" USING "btree" ("salon_id", "status");



CREATE INDEX "idx_booksy_sync_logs_salon_id" ON "public"."booksy_sync_logs" USING "btree" ("salon_id");



CREATE INDEX "idx_booksy_sync_logs_started" ON "public"."booksy_sync_logs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_booksy_sync_logs_triggered" ON "public"."booksy_sync_logs" USING "btree" ("triggered_by");



CREATE INDEX "idx_client_forms_booking_id" ON "public"."client_forms" USING "btree" ("booking_id");



CREATE INDEX "idx_client_forms_client_id" ON "public"."client_forms" USING "btree" ("client_id");



CREATE INDEX "idx_client_forms_fill_token" ON "public"."client_forms" USING "btree" ("fill_token") WHERE ("fill_token" IS NOT NULL);



CREATE INDEX "idx_client_forms_health_consent" ON "public"."client_forms" USING "btree" ("health_consent_at") WHERE ("health_consent_at" IS NOT NULL);



CREATE INDEX "idx_client_violations_client_occurred" ON "public"."client_violations" USING "btree" ("client_id", "occurred_at" DESC);



CREATE INDEX "idx_clients_code" ON "public"."clients" USING "btree" ("salon_id", "client_code");



CREATE INDEX "idx_clients_deleted_at" ON "public"."clients" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_clients_phone" ON "public"."clients" USING "btree" ("salon_id", "phone");



CREATE INDEX "idx_clients_salon_email" ON "public"."clients" USING "btree" ("salon_id", "email") WHERE (("deleted_at" IS NULL) AND ("email" IS NOT NULL));



CREATE INDEX "idx_clients_salon_id" ON "public"."clients" USING "btree" ("salon_id");



CREATE INDEX "idx_clients_salon_last_visit_at" ON "public"."clients" USING "btree" ("salon_id", "last_visit_at");



CREATE UNIQUE INDEX "idx_clients_salon_phone" ON "public"."clients" USING "btree" ("salon_id", "phone") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_crm_automations_salon_active" ON "public"."crm_automations" USING "btree" ("salon_id", "is_active");



CREATE INDEX "idx_crm_campaigns_salon_scheduled_at" ON "public"."crm_campaigns" USING "btree" ("salon_id", "scheduled_at");



CREATE INDEX "idx_crm_campaigns_salon_status" ON "public"."crm_campaigns" USING "btree" ("salon_id", "status");



CREATE INDEX "idx_crm_completed_booking_applications_salon_client" ON "public"."crm_completed_booking_applications" USING "btree" ("salon_id", "client_id");



CREATE INDEX "idx_employee_exceptions_date" ON "public"."employee_schedule_exceptions" USING "btree" ("employee_id", "exception_date");



CREATE INDEX "idx_employee_exceptions_employee" ON "public"."employee_schedule_exceptions" USING "btree" ("employee_id");



CREATE INDEX "idx_employee_exceptions_salon" ON "public"."employee_schedule_exceptions" USING "btree" ("salon_id");



CREATE INDEX "idx_employee_schedules_employee" ON "public"."employee_schedules" USING "btree" ("employee_id");



CREATE INDEX "idx_employee_schedules_lookup" ON "public"."employee_schedules" USING "btree" ("employee_id", "day_of_week");



CREATE INDEX "idx_employee_schedules_salon" ON "public"."employee_schedules" USING "btree" ("salon_id");



CREATE INDEX "idx_employees_active" ON "public"."employees" USING "btree" ("salon_id", "active");



CREATE INDEX "idx_employees_code" ON "public"."employees" USING "btree" ("salon_id", "employee_code");



CREATE INDEX "idx_employees_salon_active" ON "public"."employees" USING "btree" ("salon_id", "active") WHERE (("active" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_employees_salon_id" ON "public"."employees" USING "btree" ("salon_id");



CREATE UNIQUE INDEX "idx_employees_user_id" ON "public"."employees" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_employees_user_id_lookup" ON "public"."employees" USING "btree" ("user_id");



CREATE INDEX "idx_equipment_active" ON "public"."equipment" USING "btree" ("salon_id", "is_active");



CREATE INDEX "idx_equipment_bookings_booking" ON "public"."equipment_bookings" USING "btree" ("booking_id");



CREATE INDEX "idx_equipment_bookings_equipment" ON "public"."equipment_bookings" USING "btree" ("equipment_id");



CREATE INDEX "idx_equipment_bookings_time" ON "public"."equipment_bookings" USING "gist" ("equipment_id", "tstzrange"("starts_at", "ends_at", '[)'::"text"));



CREATE INDEX "idx_equipment_salon" ON "public"."equipment" USING "btree" ("salon_id");



CREATE INDEX "idx_feature_flags_enabled" ON "public"."feature_flags" USING "btree" ("salon_id", "enabled") WHERE ("enabled" = true);



CREATE INDEX "idx_feature_flags_salon_feature" ON "public"."feature_flags" USING "btree" ("salon_id", "feature_name");



CREATE INDEX "idx_form_templates_data_category" ON "public"."form_templates" USING "btree" ("data_category");



CREATE INDEX "idx_form_templates_salon_id" ON "public"."form_templates" USING "btree" ("salon_id");



CREATE INDEX "idx_health_logs_salon_accessed_at" ON "public"."health_data_access_logs" USING "btree" ("salon_id", "accessed_at" DESC);



CREATE INDEX "idx_health_logs_salon_accessed_by" ON "public"."health_data_access_logs" USING "btree" ("salon_id", "accessed_by");



CREATE INDEX "idx_health_logs_salon_client_id" ON "public"."health_data_access_logs" USING "btree" ("salon_id", "client_id");



CREATE INDEX "idx_integration_configs_salon_id" ON "public"."integration_configs" USING "btree" ("salon_id");



CREATE INDEX "idx_integration_configs_type" ON "public"."integration_configs" USING "btree" ("integration_type");



CREATE INDEX "idx_invoices_created_at" ON "public"."invoices" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_invoices_invoice_number" ON "public"."invoices" USING "btree" ("invoice_number");



CREATE INDEX "idx_invoices_p24_transaction" ON "public"."invoices" USING "btree" ("p24_transaction_id") WHERE ("p24_transaction_id" IS NOT NULL);



CREATE INDEX "idx_invoices_salon_id" ON "public"."invoices" USING "btree" ("salon_id");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "idx_invoices_subscription_id" ON "public"."invoices" USING "btree" ("subscription_id");



CREATE INDEX "idx_message_logs_automation_id" ON "public"."message_logs" USING "btree" ("automation_id") WHERE ("automation_id" IS NOT NULL);



CREATE INDEX "idx_message_logs_campaign_id" ON "public"."message_logs" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);



CREATE INDEX "idx_message_logs_client_id" ON "public"."message_logs" USING "btree" ("client_id");



CREATE INDEX "idx_message_logs_salon_created_at" ON "public"."message_logs" USING "btree" ("salon_id", "created_at" DESC);



CREATE INDEX "idx_message_templates_salon_id" ON "public"."message_templates" USING "btree" ("salon_id");



CREATE INDEX "idx_payment_methods_default" ON "public"."payment_methods" USING "btree" ("salon_id", "is_default") WHERE ("is_default" = true);



CREATE INDEX "idx_payment_methods_salon_id" ON "public"."payment_methods" USING "btree" ("salon_id");



CREATE INDEX "idx_payroll_entries_employee_id" ON "public"."payroll_entries" USING "btree" ("employee_id");



CREATE INDEX "idx_payroll_entries_run_id" ON "public"."payroll_entries" USING "btree" ("payroll_run_id");



CREATE INDEX "idx_payroll_runs_period" ON "public"."payroll_runs" USING "btree" ("salon_id", "period_month");



CREATE INDEX "idx_payroll_runs_salon_id" ON "public"."payroll_runs" USING "btree" ("salon_id");



CREATE INDEX "idx_pre_appointment_responses_fill_token" ON "public"."pre_appointment_responses" USING "btree" ("fill_token");



CREATE INDEX "idx_pre_appointment_responses_salon_submitted" ON "public"."pre_appointment_responses" USING "btree" ("salon_id", "submitted_at");



CREATE INDEX "idx_profiles_salon_id" ON "public"."profiles" USING "btree" ("salon_id");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_reminder_rules_salon_active" ON "public"."reminder_rules" USING "btree" ("salon_id", "is_active");



CREATE INDEX "idx_salon_integrations_active" ON "public"."salon_integrations" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_salon_integrations_salon_id" ON "public"."salon_integrations" USING "btree" ("salon_id");



CREATE INDEX "idx_salon_integrations_type" ON "public"."salon_integrations" USING "btree" ("integration_type");



CREATE INDEX "idx_salon_settings_salon_id" ON "public"."salon_settings" USING "btree" ("salon_id");



CREATE INDEX "idx_salons_owner_email" ON "public"."salons" USING "btree" ("owner_email");



CREATE INDEX "idx_salons_slug" ON "public"."salons" USING "btree" ("slug");



CREATE INDEX "idx_service_equipment_equipment" ON "public"."service_equipment" USING "btree" ("equipment_id");



CREATE INDEX "idx_service_equipment_service" ON "public"."service_equipment" USING "btree" ("service_id");



CREATE INDEX "idx_services_active" ON "public"."services" USING "btree" ("salon_id", "active");



CREATE INDEX "idx_services_category" ON "public"."services" USING "btree" ("salon_id", "category");



CREATE INDEX "idx_services_deleted_at" ON "public"."services" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_services_salon_active" ON "public"."services" USING "btree" ("salon_id", "active") WHERE (("active" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_services_salon_id" ON "public"."services" USING "btree" ("salon_id");



CREATE INDEX "idx_sms_messages_provider" ON "public"."sms_messages" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "idx_sms_messages_salon_client_created" ON "public"."sms_messages" USING "btree" ("salon_id", "client_id", "created_at" DESC);



CREATE INDEX "idx_subscriptions_dunning" ON "public"."subscriptions" USING "btree" ("status", "next_retry_at") WHERE ("status" = 'past_due'::"text");



CREATE INDEX "idx_subscriptions_p24_transaction" ON "public"."subscriptions" USING "btree" ("p24_transaction_id") WHERE ("p24_transaction_id" IS NOT NULL);



CREATE INDEX "idx_subscriptions_period_end" ON "public"."subscriptions" USING "btree" ("current_period_end");



CREATE INDEX "idx_subscriptions_salon_id" ON "public"."subscriptions" USING "btree" ("salon_id");



CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status");



CREATE INDEX "idx_surveys_client" ON "public"."satisfaction_surveys" USING "btree" ("client_id");



CREATE INDEX "idx_surveys_fill_token" ON "public"."satisfaction_surveys" USING "btree" ("fill_token") WHERE ("fill_token" IS NOT NULL);



CREATE INDEX "idx_surveys_salon_date" ON "public"."satisfaction_surveys" USING "btree" ("salon_id", "submitted_at" DESC);



CREATE INDEX "idx_surveys_service" ON "public"."satisfaction_surveys" USING "btree" ("service_id") WHERE ("service_id" IS NOT NULL);



CREATE INDEX "idx_usage_tracking_period" ON "public"."usage_tracking" USING "btree" ("period_month");



CREATE INDEX "idx_usage_tracking_salon_period" ON "public"."usage_tracking" USING "btree" ("salon_id", "period_month");



CREATE INDEX "idx_webhook_replay_cache_expires_at" ON "public"."webhook_replay_cache" USING "btree" ("expires_at");



CREATE INDEX "ix_treatment_photos_salon_id_client_id" ON "public"."treatment_photos" USING "btree" ("salon_id", "client_id");



CREATE INDEX "ix_treatment_photos_treatment_record_id" ON "public"."treatment_photos" USING "btree" ("treatment_record_id");



CREATE INDEX "ix_treatment_plans_salon_client" ON "public"."treatment_plans" USING "btree" ("salon_id", "client_id");



CREATE INDEX "ix_treatment_protocols_salon_id_is_active" ON "public"."treatment_protocols" USING "btree" ("salon_id", "is_active");



CREATE INDEX "ix_treatment_protocols_salon_id_service_id" ON "public"."treatment_protocols" USING "btree" ("salon_id", "service_id");



CREATE INDEX "ix_treatment_records_performed_at" ON "public"."treatment_records" USING "btree" ("performed_at" DESC);



CREATE INDEX "ix_treatment_records_salon_id_booking_id" ON "public"."treatment_records" USING "btree" ("salon_id", "booking_id");



CREATE INDEX "ix_treatment_records_salon_id_client_id" ON "public"."treatment_records" USING "btree" ("salon_id", "client_id");



CREATE INDEX "ix_treatment_records_salon_id_employee_id" ON "public"."treatment_records" USING "btree" ("salon_id", "employee_id");



CREATE INDEX "ix_treatment_sessions_plan_id" ON "public"."treatment_sessions" USING "btree" ("plan_id");



CREATE INDEX "ix_treatment_sessions_salon_booking" ON "public"."treatment_sessions" USING "btree" ("salon_id", "booking_id");



CREATE UNIQUE INDEX "uq_invoices_p24_transaction_id_not_null" ON "public"."invoices" USING "btree" ("p24_transaction_id") WHERE ("p24_transaction_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "audit_bookings" AFTER INSERT OR DELETE OR UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "audit_clients" AFTER INSERT OR DELETE OR UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "audit_employees" AFTER INSERT OR DELETE OR UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "audit_payroll_entries" AFTER INSERT OR DELETE OR UPDATE ON "public"."payroll_entries" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "audit_payroll_runs" AFTER INSERT OR DELETE OR UPDATE ON "public"."payroll_runs" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "audit_salon_integrations" AFTER INSERT OR DELETE OR UPDATE ON "public"."salon_integrations" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "audit_salon_settings" AFTER INSERT OR DELETE OR UPDATE ON "public"."salon_settings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "audit_services" AFTER INSERT OR DELETE OR UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger_func"();



CREATE OR REPLACE TRIGGER "bookings_version_check" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."check_version"();



CREATE OR REPLACE TRIGGER "clients_version_check" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."check_version"();



CREATE OR REPLACE TRIGGER "employee_exceptions_updated_at" BEFORE UPDATE ON "public"."employee_schedule_exceptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employee_schedules_updated_at" BEFORE UPDATE ON "public"."employee_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "handle_treatment_records_updated_at" BEFORE UPDATE ON "public"."treatment_records" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "on_profile_update" AFTER INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_user_claims"();



CREATE OR REPLACE TRIGGER "on_treatment_plans_updated" BEFORE UPDATE ON "public"."treatment_plans" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_treatment_protocols_updated" BEFORE UPDATE ON "public"."treatment_protocols" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_treatment_sessions_updated" BEFORE UPDATE ON "public"."treatment_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "services_version_check" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."check_version"();



CREATE OR REPLACE TRIGGER "set_invoice_number_trigger" BEFORE INSERT ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_invoice_number"();



CREATE OR REPLACE TRIGGER "soft_delete_bookings_trigger" BEFORE DELETE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."soft_delete_booking"();



CREATE OR REPLACE TRIGGER "soft_delete_clients_trigger" BEFORE DELETE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."soft_delete_client"();



CREATE OR REPLACE TRIGGER "soft_delete_employees_trigger" BEFORE DELETE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."soft_delete_employee"();



CREATE OR REPLACE TRIGGER "soft_delete_services_trigger" BEFORE DELETE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."soft_delete_service"();



CREATE OR REPLACE TRIGGER "sync_subscription_status_trigger" AFTER INSERT OR UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_subscription_status"();



CREATE OR REPLACE TRIGGER "trg_crm_booking_completed_update_client" AFTER INSERT OR UPDATE OF "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."crm_apply_completed_booking_to_client"();



CREATE OR REPLACE TRIGGER "update_bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_crm_automations_updated_at" BEFORE UPDATE ON "public"."crm_automations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_crm_campaigns_updated_at" BEFORE UPDATE ON "public"."crm_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_employees_updated_at" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_feature_flags_updated_at" BEFORE UPDATE ON "public"."feature_flags" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_message_templates_updated_at" BEFORE UPDATE ON "public"."message_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payment_methods_updated_at" BEFORE UPDATE ON "public"."payment_methods" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payroll_entries_updated_at" BEFORE UPDATE ON "public"."payroll_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payroll_runs_updated_at" BEFORE UPDATE ON "public"."payroll_runs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_salons_updated_at" BEFORE UPDATE ON "public"."salons" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_usage_tracking_updated_at" BEFORE UPDATE ON "public"."usage_tracking" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."beauty_plan_steps"
    ADD CONSTRAINT "beauty_plan_steps_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."beauty_plan_steps"
    ADD CONSTRAINT "beauty_plan_steps_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."beauty_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beauty_plan_steps"
    ADD CONSTRAINT "beauty_plan_steps_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."beauty_plans"
    ADD CONSTRAINT "beauty_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beauty_plans"
    ADD CONSTRAINT "beauty_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."blacklist_settings"
    ADD CONSTRAINT "blacklist_settings_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."booksy_pending_emails"
    ADD CONSTRAINT "booksy_pending_emails_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booksy_sync_logs"
    ADD CONSTRAINT "booksy_sync_logs_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_forms"
    ADD CONSTRAINT "client_forms_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_forms"
    ADD CONSTRAINT "client_forms_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_forms"
    ADD CONSTRAINT "client_forms_form_template_id_fkey" FOREIGN KEY ("form_template_id") REFERENCES "public"."form_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."client_violations"
    ADD CONSTRAINT "client_violations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_violations"
    ADD CONSTRAINT "client_violations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_automations"
    ADD CONSTRAINT "crm_automations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."crm_automations"
    ADD CONSTRAINT "crm_automations_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_automations"
    ADD CONSTRAINT "crm_automations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_campaigns"
    ADD CONSTRAINT "crm_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."crm_campaigns"
    ADD CONSTRAINT "crm_campaigns_salon_automation_id_fkey" FOREIGN KEY ("salon_id", "automation_id") REFERENCES "public"."crm_automations"("salon_id", "id") ON DELETE SET NULL ("automation_id");



ALTER TABLE ONLY "public"."crm_campaigns"
    ADD CONSTRAINT "crm_campaigns_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_campaigns"
    ADD CONSTRAINT "crm_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_completed_booking_applications"
    ADD CONSTRAINT "crm_completed_booking_applications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_completed_booking_applications"
    ADD CONSTRAINT "crm_completed_booking_applications_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_completed_booking_applications"
    ADD CONSTRAINT "crm_completed_booking_applications_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_schedule_exceptions"
    ADD CONSTRAINT "employee_schedule_exceptions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_schedule_exceptions"
    ADD CONSTRAINT "employee_schedule_exceptions_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_schedules"
    ADD CONSTRAINT "employee_schedules_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_schedules"
    ADD CONSTRAINT "employee_schedules_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_bookings"
    ADD CONSTRAINT "equipment_bookings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment_bookings"
    ADD CONSTRAINT "equipment_bookings_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."form_templates"
    ADD CONSTRAINT "form_templates_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."health_data_access_logs"
    ADD CONSTRAINT "health_data_access_logs_accessed_by_fkey" FOREIGN KEY ("accessed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."health_data_access_logs"
    ADD CONSTRAINT "health_data_access_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."health_data_access_logs"
    ADD CONSTRAINT "health_data_access_logs_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_configs"
    ADD CONSTRAINT "integration_configs_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_logs"
    ADD CONSTRAINT "message_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."crm_campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_logs"
    ADD CONSTRAINT "message_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_logs"
    ADD CONSTRAINT "message_logs_salon_automation_id_fkey" FOREIGN KEY ("salon_id", "automation_id") REFERENCES "public"."crm_automations"("salon_id", "id") ON DELETE SET NULL ("automation_id");



ALTER TABLE ONLY "public"."message_logs"
    ADD CONSTRAINT "message_logs_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_entries"
    ADD CONSTRAINT "payroll_entries_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pre_appointment_responses"
    ADD CONSTRAINT "pre_appointment_responses_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pre_appointment_responses"
    ADD CONSTRAINT "pre_appointment_responses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pre_appointment_responses"
    ADD CONSTRAINT "pre_appointment_responses_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminder_rules"
    ADD CONSTRAINT "reminder_rules_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salon_integrations"
    ADD CONSTRAINT "salon_integrations_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salon_settings"
    ADD CONSTRAINT "salon_settings_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id");



ALTER TABLE ONLY "public"."salons"
    ADD CONSTRAINT "salons_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."satisfaction_surveys"
    ADD CONSTRAINT "satisfaction_surveys_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."satisfaction_surveys"
    ADD CONSTRAINT "satisfaction_surveys_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."satisfaction_surveys"
    ADD CONSTRAINT "satisfaction_surveys_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."satisfaction_surveys"
    ADD CONSTRAINT "satisfaction_surveys_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_equipment"
    ADD CONSTRAINT "service_equipment_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_equipment"
    ADD CONSTRAINT "service_equipment_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_forms"
    ADD CONSTRAINT "service_forms_form_template_id_fkey" FOREIGN KEY ("form_template_id") REFERENCES "public"."form_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_forms"
    ADD CONSTRAINT "service_forms_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sms_messages"
    ADD CONSTRAINT "sms_messages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sms_messages"
    ADD CONSTRAINT "sms_messages_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sms_wallet"
    ADD CONSTRAINT "sms_wallet_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_photos"
    ADD CONSTRAINT "treatment_photos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_photos"
    ADD CONSTRAINT "treatment_photos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."treatment_photos"
    ADD CONSTRAINT "treatment_photos_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_photos"
    ADD CONSTRAINT "treatment_photos_treatment_record_id_fkey" FOREIGN KEY ("treatment_record_id") REFERENCES "public"."treatment_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_plans"
    ADD CONSTRAINT "treatment_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_plans"
    ADD CONSTRAINT "treatment_plans_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "public"."treatment_protocols"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_plans"
    ADD CONSTRAINT "treatment_plans_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_plans"
    ADD CONSTRAINT "treatment_plans_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_protocols"
    ADD CONSTRAINT "treatment_protocols_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_protocols"
    ADD CONSTRAINT "treatment_protocols_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_records"
    ADD CONSTRAINT "treatment_records_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_records"
    ADD CONSTRAINT "treatment_records_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_records"
    ADD CONSTRAINT "treatment_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."treatment_records"
    ADD CONSTRAINT "treatment_records_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_records"
    ADD CONSTRAINT "treatment_records_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_sessions"
    ADD CONSTRAINT "treatment_sessions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treatment_sessions"
    ADD CONSTRAINT "treatment_sessions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."treatment_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_sessions"
    ADD CONSTRAINT "treatment_sessions_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treatment_sessions"
    ADD CONSTRAINT "treatment_sessions_treatment_record_id_fkey" FOREIGN KEY ("treatment_record_id") REFERENCES "public"."treatment_records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usage_tracking"
    ADD CONSTRAINT "usage_tracking_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



CREATE POLICY "Allow DELETE on treatment_records for owner" ON "public"."treatment_records" FOR DELETE USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "Allow INSERT on treatment_records for owner/manager" ON "public"."treatment_records" FOR INSERT WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "Allow SELECT on treatment_records for salon members" ON "public"."treatment_records" FOR SELECT USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]) OR ("employee_id" = "public"."get_user_employee_id"()))));



CREATE POLICY "Allow UPDATE on treatment_records for owner/manager" ON "public"."treatment_records" FOR UPDATE USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]))) WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "Allow authenticated users to read settings" ON "public"."salon_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to select responses for their salon" ON "public"."pre_appointment_responses" FOR SELECT TO "authenticated" USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "Allow delete for owners" ON "public"."treatment_plans" FOR DELETE USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "Allow delete for owners" ON "public"."treatment_sessions" FOR DELETE USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "Allow delete for salon owner" ON "public"."treatment_protocols" FOR DELETE USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "Allow employees to insert treatment photos" ON "public"."treatment_photos" FOR INSERT WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text", 'employee'::"text"])));



CREATE POLICY "Allow insert for owners/managers" ON "public"."treatment_plans" FOR INSERT WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "Allow insert for owners/managers" ON "public"."treatment_sessions" FOR INSERT WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "Allow insert for salon owner/manager" ON "public"."treatment_protocols" FOR INSERT WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "Allow managers to delete treatment photos" ON "public"."treatment_photos" FOR DELETE USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "Allow read for salon members" ON "public"."treatment_protocols" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "Allow salon owners to read access logs" ON "public"."health_data_access_logs" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "Allow salon users to view treatment photos" ON "public"."treatment_photos" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "Allow select access to salon members" ON "public"."treatment_plans" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "Allow select access to salon members" ON "public"."treatment_sessions" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "Allow service role to insert responses" ON "public"."pre_appointment_responses" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Allow service role to update responses" ON "public"."pre_appointment_responses" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow update for owners/managers" ON "public"."treatment_plans" FOR UPDATE USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]))) WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "Allow update for owners/managers" ON "public"."treatment_sessions" FOR UPDATE USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]))) WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "Allow update for salon owner/manager" ON "public"."treatment_protocols" FOR UPDATE USING (("salon_id" = "public"."get_user_salon_id"())) WITH CHECK ("public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]));



CREATE POLICY "Allow users to manage their own salon settings" ON "public"."salon_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND ("profiles"."salon_id" = "salon_settings"."salon_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND ("profiles"."salon_id" = "salon_settings"."salon_id")))));



CREATE POLICY "Employees are viewable by salon members." ON "public"."employees" FOR SELECT USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL)));



COMMENT ON POLICY "Employees are viewable by salon members." ON "public"."employees" IS 'Allows salon members to view active employees in their salon.';



CREATE POLICY "Employees can be created by salon owner/manager." ON "public"."employees" FOR INSERT WITH CHECK (("public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]) AND ("salon_id" = "public"."get_user_salon_id"())));



COMMENT ON POLICY "Employees can be created by salon owner/manager." ON "public"."employees" IS 'Allows owners and managers to create new employee records for their salon.';



CREATE POLICY "Employees can be deleted by owner/manager for their salon." ON "public"."employees" FOR DELETE USING (("public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]) AND ("salon_id" = "public"."get_user_salon_id"())));



COMMENT ON POLICY "Employees can be deleted by owner/manager for their salon." ON "public"."employees" IS 'Allows owners and managers to delete employee records in their salon.';



CREATE POLICY "Employees can be updated by owner/manager for their salon." ON "public"."employees" FOR UPDATE USING (("public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]) AND ("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL)));



COMMENT ON POLICY "Employees can be updated by owner/manager for their salon." ON "public"."employees" IS 'Allows owners and managers to update active employee records in their salon.';



CREATE POLICY "Enable all access for authenticated users" ON "public"."bookings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all access for authenticated users" ON "public"."employees" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all access for authenticated users" ON "public"."payroll_entries" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all access for authenticated users" ON "public"."payroll_runs" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all access for authenticated users" ON "public"."services" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users" ON "public"."salons" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Enable read access for authenticated users" ON "public"."salons" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Enable update for own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Enable update for salon owners" ON "public"."salons" FOR UPDATE TO "authenticated" USING (("owner_email" = ("auth"."jwt"() ->> 'email'::"text")));



CREATE POLICY "Members can update relevant bookings" ON "public"."bookings" FOR UPDATE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL) AND ("public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]) OR ("employee_id" = "public"."get_user_employee_id"())))) WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



COMMENT ON POLICY "Members can update relevant bookings" ON "public"."bookings" IS 'Owner/Manager mogą edytować wszystkie wizyty. Employee może edytować tylko swoje wizyty.';



CREATE POLICY "Only owners can create payroll entries" ON "public"."payroll_entries" FOR INSERT TO "authenticated" WITH CHECK (("payroll_run_id" IN ( SELECT "payroll_runs"."id"
   FROM "public"."payroll_runs"
  WHERE (("payroll_runs"."salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")))));



COMMENT ON POLICY "Only owners can create payroll entries" ON "public"."payroll_entries" IS 'Tylko właściciele mogą tworzyć wpisy payroll.';



CREATE POLICY "Only owners can create payroll runs" ON "public"."payroll_runs" FOR INSERT TO "authenticated" WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



COMMENT ON POLICY "Only owners can create payroll runs" ON "public"."payroll_runs" IS 'Tylko właściciele salonu mogą tworzyć okresy rozliczeniowe.';



CREATE POLICY "Only owners can delete payroll entries" ON "public"."payroll_entries" FOR DELETE TO "authenticated" USING (("payroll_run_id" IN ( SELECT "payroll_runs"."id"
   FROM "public"."payroll_runs"
  WHERE (("payroll_runs"."salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")))));



CREATE POLICY "Only owners can delete payroll runs" ON "public"."payroll_runs" FOR DELETE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "Only owners can update payroll entries" ON "public"."payroll_entries" FOR UPDATE TO "authenticated" USING (("payroll_run_id" IN ( SELECT "payroll_runs"."id"
   FROM "public"."payroll_runs"
  WHERE (("payroll_runs"."salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")))));



CREATE POLICY "Only owners can update payroll runs" ON "public"."payroll_runs" FOR UPDATE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text"))) WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "Only owners can view payroll runs" ON "public"."payroll_runs" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text") AND ("deleted_at" IS NULL)));



COMMENT ON POLICY "Only owners can view payroll runs" ON "public"."payroll_runs" IS 'Tylko właściciele salonu mogą przeglądać okresy rozliczeniowe.';



CREATE POLICY "Owner/Manager can update employee profiles (role/data)." ON "public"."profiles" FOR UPDATE USING (("public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]) AND ("salon_id" = "public"."get_user_salon_id"()))) WITH CHECK (("role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'employee'::"text", 'admin'::"text"])));



COMMENT ON POLICY "Owner/Manager can update employee profiles (role/data)." ON "public"."profiles" IS 'Allows owners and managers to manage roles and data for profiles within their salon.';



CREATE POLICY "Owners and managers can create employees" ON "public"."employees" FOR INSERT TO "authenticated" WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



COMMENT ON POLICY "Owners and managers can create employees" ON "public"."employees" IS 'Tylko właściciele i menedżerowie mogą dodawać nowych pracowników.';



CREATE POLICY "Owners and managers can create services" ON "public"."services" FOR INSERT TO "authenticated" WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



COMMENT ON POLICY "Owners and managers can create services" ON "public"."services" IS 'Tylko właściciele i menedżerowie mogą tworzyć nowe usługi.';



CREATE POLICY "Owners and managers can delete bookings" ON "public"."bookings" FOR DELETE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



COMMENT ON POLICY "Owners and managers can delete bookings" ON "public"."bookings" IS 'Tylko właściciele i menedżerowie mogą usuwać wizyty.';



CREATE POLICY "Owners and managers can delete employees" ON "public"."employees" FOR DELETE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



COMMENT ON POLICY "Owners and managers can delete employees" ON "public"."employees" IS 'Tylko właściciele i menedżerowie mogą usuwać pracowników.';



CREATE POLICY "Owners and managers can delete services" ON "public"."services" FOR DELETE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



COMMENT ON POLICY "Owners and managers can delete services" ON "public"."services" IS 'Tylko właściciele i menedżerowie mogą usuwać usługi.';



CREATE POLICY "Owners and managers can update employees" ON "public"."employees" FOR UPDATE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]))) WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



COMMENT ON POLICY "Owners and managers can update employees" ON "public"."employees" IS 'Tylko właściciele i menedżerowie mogą edytować dane pracowników.';



CREATE POLICY "Owners and managers can update services" ON "public"."services" FOR UPDATE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]))) WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



COMMENT ON POLICY "Owners and managers can update services" ON "public"."services" IS 'Tylko właściciele i menedżerowie mogą edytować usługi.';



CREATE POLICY "Owners can create integrations" ON "public"."salon_integrations" FOR INSERT TO "authenticated" WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



COMMENT ON POLICY "Owners can create integrations" ON "public"."salon_integrations" IS 'Tylko właściciel może dodawać nowe integracje.';



CREATE POLICY "Owners can create settings" ON "public"."salon_settings" FOR INSERT TO "authenticated" WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



COMMENT ON POLICY "Owners can create settings" ON "public"."salon_settings" IS 'Tylko właściciel może utworzyć ustawienia salonu (podczas inicjalizacji).';



CREATE POLICY "Owners can delete integrations" ON "public"."salon_integrations" FOR DELETE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



COMMENT ON POLICY "Owners can delete integrations" ON "public"."salon_integrations" IS 'Tylko właściciel może usuwać integracje.';



CREATE POLICY "Owners can update integrations" ON "public"."salon_integrations" FOR UPDATE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text"))) WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



COMMENT ON POLICY "Owners can update integrations" ON "public"."salon_integrations" IS 'Tylko właściciel może edytować integracje.';



CREATE POLICY "Owners can update settings" ON "public"."salon_settings" FOR UPDATE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text"))) WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



COMMENT ON POLICY "Owners can update settings" ON "public"."salon_settings" IS 'Tylko właściciel może edytować ustawienia salonu.';



CREATE POLICY "Owners view audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "Profiles are viewable by salon members." ON "public"."profiles" FOR SELECT USING ((("salon_id" = "public"."get_user_salon_id"()) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Salon members can create bookings" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



COMMENT ON POLICY "Salon members can create bookings" ON "public"."bookings" IS 'Wszyscy pracownicy salonu mogą tworzyć nowe wizyty.';



CREATE POLICY "Salon members can view all bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL)));



COMMENT ON POLICY "Salon members can view all bookings" ON "public"."bookings" IS 'Wszyscy pracownicy salonu mogą przeglądać wszystkie wizyty (read-only dla employees).';



CREATE POLICY "Salon members can view bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL)));



CREATE POLICY "Salon members can view employees" ON "public"."employees" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL)));



COMMENT ON POLICY "Salon members can view employees" ON "public"."employees" IS 'Wszyscy pracownicy salonu mogą przeglądać listę pracowników.';



CREATE POLICY "Salon members can view feature flags" ON "public"."feature_flags" FOR SELECT TO "authenticated" USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "Salon members can view integrations" ON "public"."salon_integrations" FOR SELECT TO "authenticated" USING (("salon_id" = "public"."get_user_salon_id"()));



COMMENT ON POLICY "Salon members can view integrations" ON "public"."salon_integrations" IS 'Wszyscy pracownicy salonu mogą przeglądać integracje.';



CREATE POLICY "Salon members can view services" ON "public"."services" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL)));



COMMENT ON POLICY "Salon members can view services" ON "public"."services" IS 'Wszyscy pracownicy salonu mogą przeglądać usługi.';



CREATE POLICY "Salon members can view settings" ON "public"."salon_settings" FOR SELECT TO "authenticated" USING (("salon_id" = "public"."get_user_salon_id"()));



COMMENT ON POLICY "Salon members can view settings" ON "public"."salon_settings" IS 'Wszyscy pracownicy salonu mogą przeglądać ustawienia.';



CREATE POLICY "Salon members can view usage tracking" ON "public"."usage_tracking" FOR SELECT TO "authenticated" USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "Salon owners and managers can view invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "Salon owners can manage payment methods" ON "public"."payment_methods" TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text"))) WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "Salon owners can manage subscriptions" ON "public"."subscriptions" TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text"))) WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "Salon owners can update their salon" ON "public"."salons" FOR UPDATE TO "authenticated" USING ((("id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text"))) WITH CHECK (("id" = "public"."get_user_salon_id"()));



COMMENT ON POLICY "Salon owners can update their salon" ON "public"."salons" IS 'Tylko właściciele (role=owner) mogą aktualizować dane salonu.';



CREATE POLICY "Salon owners can view subscriptions" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "Users can manage own integrations" ON "public"."integration_configs" USING (("salon_id" IN ( SELECT "profiles"."salon_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update own salon settings" ON "public"."salon_settings" FOR UPDATE USING (("salon_id" IN ( SELECT "profiles"."salon_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update their own profile." ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own integrations" ON "public"."integration_configs" FOR SELECT USING (("salon_id" IN ( SELECT "profiles"."salon_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view own salon settings" ON "public"."salon_settings" FOR SELECT USING (("salon_id" IN ( SELECT "profiles"."salon_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own salon" ON "public"."salons" FOR SELECT TO "authenticated" USING ((("id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL)));



COMMENT ON POLICY "Users can view their own salon" ON "public"."salons" IS 'Użytkownicy mogą widzieć tylko dane swojego salonu.';



CREATE POLICY "Users can view their salon's sync logs" ON "public"."booksy_sync_logs" FOR SELECT TO "authenticated" USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "View payroll entries based on role" ON "public"."payroll_entries" FOR SELECT TO "authenticated" USING ((("payroll_run_id" IN ( SELECT "payroll_runs"."id"
   FROM "public"."payroll_runs"
  WHERE (("payroll_runs"."salon_id" = "public"."get_user_salon_id"()) AND ("payroll_runs"."deleted_at" IS NULL)))) AND ("public"."has_salon_role"('owner'::"text") OR ("employee_id" = "public"."get_user_employee_id"()))));



COMMENT ON POLICY "View payroll entries based on role" ON "public"."payroll_entries" IS 'Właściciel widzi wszystkie wpisy payroll, pracownik widzi tylko swoje.';



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."beauty_plan_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "beauty_plan_steps_select" ON "public"."beauty_plan_steps" FOR SELECT USING (("plan_id" IN ( SELECT "bp"."id"
   FROM ("public"."beauty_plans" "bp"
     JOIN "public"."clients" "c" ON (("c"."id" = "bp"."client_id")))
  WHERE ("c"."salon_id" = "public"."get_user_salon_id"()))));



CREATE POLICY "beauty_plan_steps_write" ON "public"."beauty_plan_steps" USING ((("plan_id" IN ( SELECT "bp"."id"
   FROM ("public"."beauty_plans" "bp"
     JOIN "public"."clients" "c" ON (("c"."id" = "bp"."client_id")))
  WHERE ("c"."salon_id" = "public"."get_user_salon_id"()))) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



ALTER TABLE "public"."beauty_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "beauty_plans_select" ON "public"."beauty_plans" FOR SELECT USING (("client_id" IN ( SELECT "c"."id"
   FROM "public"."clients" "c"
  WHERE ("c"."salon_id" = "public"."get_user_salon_id"()))));



CREATE POLICY "beauty_plans_write" ON "public"."beauty_plans" USING ((("client_id" IN ( SELECT "c"."id"
   FROM "public"."clients" "c"
  WHERE ("c"."salon_id" = "public"."get_user_salon_id"()))) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



ALTER TABLE "public"."blacklist_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booksy_pending_emails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booksy_sync_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_forms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_forms_select" ON "public"."client_forms" FOR SELECT USING ((("client_id" IN ( SELECT "c"."id"
   FROM "public"."clients" "c"
  WHERE ("c"."salon_id" = "public"."get_user_salon_id"()))) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "client_forms_write" ON "public"."client_forms" USING ((("client_id" IN ( SELECT "c"."id"
   FROM "public"."clients" "c"
  WHERE ("c"."salon_id" = "public"."get_user_salon_id"()))) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



ALTER TABLE "public"."client_violations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_delete_owner_manager_only" ON "public"."clients" FOR DELETE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "clients_insert_same_salon" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "clients_select_same_salon" ON "public"."clients" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL)));



CREATE POLICY "clients_update_same_salon" ON "public"."clients" FOR UPDATE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND ("deleted_at" IS NULL))) WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



ALTER TABLE "public"."crm_automations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_automations_delete_owner_only" ON "public"."crm_automations" FOR DELETE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "crm_automations_insert_owner_only" ON "public"."crm_automations" FOR INSERT TO "authenticated" WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "crm_automations_select_owner_manager" ON "public"."crm_automations" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "crm_automations_update_owner_only" ON "public"."crm_automations" FOR UPDATE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text"))) WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



ALTER TABLE "public"."crm_campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_campaigns_delete_owner_only" ON "public"."crm_campaigns" FOR DELETE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "crm_campaigns_insert_owner_manager" ON "public"."crm_campaigns" FOR INSERT TO "authenticated" WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "crm_campaigns_select_members" ON "public"."crm_campaigns" FOR SELECT TO "authenticated" USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "crm_campaigns_update_owner_manager" ON "public"."crm_campaigns" FOR UPDATE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]))) WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "crm_message_logs_select_owner_manager" ON "public"."message_logs" FOR SELECT TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "crm_templates_delete_owner_only" ON "public"."message_templates" FOR DELETE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_salon_role"('owner'::"text")));



CREATE POLICY "crm_templates_insert_owner_manager" ON "public"."message_templates" FOR INSERT TO "authenticated" WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "crm_templates_select_members" ON "public"."message_templates" FOR SELECT TO "authenticated" USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "crm_templates_update_owner_manager" ON "public"."message_templates" FOR UPDATE TO "authenticated" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"]))) WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



ALTER TABLE "public"."employee_schedule_exceptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."form_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "form_templates_select" ON "public"."form_templates" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "form_templates_write" ON "public"."form_templates" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



ALTER TABLE "public"."health_data_access_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."integration_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manager_write_employee_exceptions" ON "public"."employee_schedule_exceptions" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "manager_write_employee_schedules" ON "public"."employee_schedules" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



ALTER TABLE "public"."message_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner_write_equipment" ON "public"."equipment" USING ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "owner_write_service_equipment" ON "public"."service_equipment" USING ((("service_id" IN ( SELECT "services"."id"
   FROM "public"."services"
  WHERE ("services"."salon_id" = "public"."get_user_salon_id"()))) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pre_appointment_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reminder_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."salon_integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "salon_integrations_delete_policy" ON "public"."salon_integrations" FOR DELETE USING (("salon_id" IN ( SELECT "profiles"."salon_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "salon_integrations_insert_policy" ON "public"."salon_integrations" FOR INSERT WITH CHECK (("salon_id" IN ( SELECT "profiles"."salon_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "salon_integrations_select_policy" ON "public"."salon_integrations" FOR SELECT USING (("salon_id" IN ( SELECT "profiles"."salon_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "salon_integrations_update_policy" ON "public"."salon_integrations" FOR UPDATE USING (("salon_id" IN ( SELECT "profiles"."salon_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "salon_members_read_sms_wallet" ON "public"."sms_wallet" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "salon_members_select_pending_emails" ON "public"."booksy_pending_emails" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "salon_members_update_pending_emails" ON "public"."booksy_pending_emails" FOR UPDATE USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "salon_read_employee_exceptions" ON "public"."employee_schedule_exceptions" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "salon_read_employee_schedules" ON "public"."employee_schedules" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "salon_read_equipment" ON "public"."equipment" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "salon_read_equipment_bookings" ON "public"."equipment_bookings" FOR SELECT USING (("equipment_id" IN ( SELECT "equipment"."id"
   FROM "public"."equipment"
  WHERE ("equipment"."salon_id" = "public"."get_user_salon_id"()))));



CREATE POLICY "salon_read_service_equipment" ON "public"."service_equipment" FOR SELECT USING (("service_id" IN ( SELECT "services"."id"
   FROM "public"."services"
  WHERE ("services"."salon_id" = "public"."get_user_salon_id"()))));



CREATE POLICY "salon_read_surveys" ON "public"."satisfaction_surveys" FOR SELECT USING (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "salon_rw_blacklist_settings" ON "public"."blacklist_settings" USING (("salon_id" = "public"."get_user_salon_id"())) WITH CHECK ((("salon_id" = "public"."get_user_salon_id"()) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "salon_rw_client_violations" ON "public"."client_violations" USING (("client_id" IN ( SELECT "c"."id"
   FROM "public"."clients" "c"
  WHERE ("c"."salon_id" = "public"."get_user_salon_id"())))) WITH CHECK (("client_id" IN ( SELECT "c"."id"
   FROM "public"."clients" "c"
  WHERE ("c"."salon_id" = "public"."get_user_salon_id"()))));



CREATE POLICY "salon_rw_reminder_rules" ON "public"."reminder_rules" USING (("salon_id" = "public"."get_user_salon_id"())) WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



CREATE POLICY "salon_rw_sms_messages" ON "public"."sms_messages" USING (("salon_id" = "public"."get_user_salon_id"())) WITH CHECK (("salon_id" = "public"."get_user_salon_id"()));



ALTER TABLE "public"."salon_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "salon_write_equipment_bookings" ON "public"."equipment_bookings" USING (("equipment_id" IN ( SELECT "equipment"."id"
   FROM "public"."equipment"
  WHERE ("equipment"."salon_id" = "public"."get_user_salon_id"()))));



ALTER TABLE "public"."salons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."satisfaction_surveys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_forms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_forms_select" ON "public"."service_forms" FOR SELECT USING (("form_template_id" IN ( SELECT "form_templates"."id"
   FROM "public"."form_templates"
  WHERE ("form_templates"."salon_id" = "public"."get_user_salon_id"()))));



CREATE POLICY "service_forms_write" ON "public"."service_forms" USING ((("form_template_id" IN ( SELECT "form_templates"."id"
   FROM "public"."form_templates"
  WHERE ("form_templates"."salon_id" = "public"."get_user_salon_id"()))) AND "public"."has_any_salon_role"(ARRAY['owner'::"text", 'manager'::"text"])));



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sms_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sms_wallet" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_protocols" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."treatment_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_tracking" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_trigger_func"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_trigger_func"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_trigger_func"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_vat"("subtotal_cents" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_vat"("subtotal_cents" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_vat"("subtotal_cents" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_equipment_availability"("p_equipment_ids" "uuid"[], "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exclude_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_equipment_availability"("p_equipment_ids" "uuid"[], "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exclude_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_equipment_availability"("p_equipment_ids" "uuid"[], "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exclude_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_version"() TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_atomic"("p_salon_id" "uuid", "p_employee_id" "uuid", "p_client_id" "uuid", "p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone, "p_duration" integer, "p_base_price" numeric, "p_notes" "text", "p_status" "text", "p_created_by" "uuid", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_atomic"("p_salon_id" "uuid", "p_employee_id" "uuid", "p_client_id" "uuid", "p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone, "p_duration" integer, "p_base_price" numeric, "p_notes" "text", "p_status" "text", "p_created_by" "uuid", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_atomic"("p_salon_id" "uuid", "p_employee_id" "uuid", "p_client_id" "uuid", "p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone, "p_duration" integer, "p_base_price" numeric, "p_notes" "text", "p_status" "text", "p_created_by" "uuid", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."crm_apply_completed_booking_to_client"() TO "anon";
GRANT ALL ON FUNCTION "public"."crm_apply_completed_booking_to_client"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_apply_completed_booking_to_client"() TO "service_role";



GRANT ALL ON FUNCTION "public"."crm_increment_campaign_counter"("p_campaign_id" "uuid", "p_counter_name" "text", "p_increment_by" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."crm_increment_campaign_counter"("p_campaign_id" "uuid", "p_counter_name" "text", "p_increment_by" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_increment_campaign_counter"("p_campaign_id" "uuid", "p_counter_name" "text", "p_increment_by" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."crm_increment_usage_counter"("p_salon_id" "uuid", "p_period_month" "text", "p_channel" "text", "p_increment_by" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."crm_increment_usage_counter"("p_salon_id" "uuid", "p_period_month" "text", "p_channel" "text", "p_increment_by" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_increment_usage_counter"("p_salon_id" "uuid", "p_period_month" "text", "p_channel" "text", "p_increment_by" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_sms_balance"("p_salon_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_sms_balance"("p_salon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_sms_balance"("p_salon_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_client_code"("salon_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_client_code"("salon_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_client_code"("salon_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_employee_code"("salon_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_employee_code"("salon_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_employee_code"("salon_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_employee_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_employee_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_employee_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_salon_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_salon_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_salon_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_any_salon_role"("required_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_any_salon_role"("required_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_any_salon_role"("required_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."has_salon_role"("required_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_salon_role"("required_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_salon_role"("required_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_client_no_show"("p_client_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_client_no_show"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_client_no_show"("p_client_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_client_visits"("client_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_client_visits"("client_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_client_visits"("client_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_employee_to_user_by_email"("employee_uuid" "uuid", "user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."link_employee_to_user_by_email"("employee_uuid" "uuid", "user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_employee_to_user_by_email"("employee_uuid" "uuid", "user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_crm_templates"("p_salon_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_crm_templates"("p_salon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_crm_templates"("p_salon_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_invoice_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_invoice_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_invoice_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."soft_delete_booking"() TO "anon";
GRANT ALL ON FUNCTION "public"."soft_delete_booking"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_booking"() TO "service_role";



GRANT ALL ON FUNCTION "public"."soft_delete_client"() TO "anon";
GRANT ALL ON FUNCTION "public"."soft_delete_client"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_client"() TO "service_role";



GRANT ALL ON FUNCTION "public"."soft_delete_employee"() TO "anon";
GRANT ALL ON FUNCTION "public"."soft_delete_employee"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_employee"() TO "service_role";



GRANT ALL ON FUNCTION "public"."soft_delete_service"() TO "anon";
GRANT ALL ON FUNCTION "public"."soft_delete_service"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_service"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_subscription_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_subscription_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_subscription_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_user_claims"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_user_claims"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_user_claims"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."beauty_plan_steps" TO "anon";
GRANT ALL ON TABLE "public"."beauty_plan_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."beauty_plan_steps" TO "service_role";



GRANT ALL ON TABLE "public"."beauty_plans" TO "anon";
GRANT ALL ON TABLE "public"."beauty_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."beauty_plans" TO "service_role";



GRANT ALL ON TABLE "public"."blacklist_settings" TO "anon";
GRANT ALL ON TABLE "public"."blacklist_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."blacklist_settings" TO "service_role";



GRANT ALL ON TABLE "public"."booksy_pending_emails" TO "anon";
GRANT ALL ON TABLE "public"."booksy_pending_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."booksy_pending_emails" TO "service_role";



GRANT ALL ON TABLE "public"."booksy_sync_logs" TO "anon";
GRANT ALL ON TABLE "public"."booksy_sync_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."booksy_sync_logs" TO "service_role";



GRANT ALL ON TABLE "public"."client_forms" TO "anon";
GRANT ALL ON TABLE "public"."client_forms" TO "authenticated";
GRANT ALL ON TABLE "public"."client_forms" TO "service_role";



GRANT ALL ON TABLE "public"."client_violations" TO "anon";
GRANT ALL ON TABLE "public"."client_violations" TO "authenticated";
GRANT ALL ON TABLE "public"."client_violations" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."crm_automations" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_automations" TO "service_role";



GRANT ALL ON TABLE "public"."crm_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."crm_completed_booking_applications" TO "anon";
GRANT ALL ON TABLE "public"."crm_completed_booking_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_completed_booking_applications" TO "service_role";



GRANT ALL ON TABLE "public"."employee_schedule_exceptions" TO "anon";
GRANT ALL ON TABLE "public"."employee_schedule_exceptions" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_schedule_exceptions" TO "service_role";



GRANT ALL ON TABLE "public"."employee_schedules" TO "anon";
GRANT ALL ON TABLE "public"."employee_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."equipment" TO "anon";
GRANT ALL ON TABLE "public"."equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_bookings" TO "anon";
GRANT ALL ON TABLE "public"."equipment_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."form_templates" TO "anon";
GRANT ALL ON TABLE "public"."form_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."form_templates" TO "service_role";



GRANT ALL ON TABLE "public"."health_data_access_logs" TO "anon";
GRANT ALL ON TABLE "public"."health_data_access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."health_data_access_logs" TO "service_role";



GRANT ALL ON TABLE "public"."integration_configs" TO "anon";
GRANT ALL ON TABLE "public"."integration_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_configs" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."message_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."message_logs" TO "service_role";



GRANT ALL ON TABLE "public"."message_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."message_templates" TO "service_role";



GRANT ALL ON TABLE "public"."payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_entries" TO "anon";
GRANT ALL ON TABLE "public"."payroll_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_entries" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_runs" TO "anon";
GRANT ALL ON TABLE "public"."payroll_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_runs" TO "service_role";



GRANT ALL ON TABLE "public"."pre_appointment_responses" TO "anon";
GRANT ALL ON TABLE "public"."pre_appointment_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."pre_appointment_responses" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reminder_rules" TO "anon";
GRANT ALL ON TABLE "public"."reminder_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."reminder_rules" TO "service_role";



GRANT ALL ON TABLE "public"."salon_integrations" TO "anon";
GRANT ALL ON TABLE "public"."salon_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."salon_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."salon_settings" TO "anon";
GRANT ALL ON TABLE "public"."salon_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."salon_settings" TO "service_role";



GRANT ALL ON TABLE "public"."salons" TO "anon";
GRANT ALL ON TABLE "public"."salons" TO "authenticated";
GRANT ALL ON TABLE "public"."salons" TO "service_role";



GRANT ALL ON TABLE "public"."satisfaction_surveys" TO "anon";
GRANT ALL ON TABLE "public"."satisfaction_surveys" TO "authenticated";
GRANT ALL ON TABLE "public"."satisfaction_surveys" TO "service_role";



GRANT ALL ON TABLE "public"."service_equipment" TO "anon";
GRANT ALL ON TABLE "public"."service_equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."service_equipment" TO "service_role";



GRANT ALL ON TABLE "public"."service_forms" TO "anon";
GRANT ALL ON TABLE "public"."service_forms" TO "authenticated";
GRANT ALL ON TABLE "public"."service_forms" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."sms_messages" TO "anon";
GRANT ALL ON TABLE "public"."sms_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_messages" TO "service_role";



GRANT ALL ON TABLE "public"."sms_wallet" TO "anon";
GRANT ALL ON TABLE "public"."sms_wallet" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_wallet" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_photos" TO "anon";
GRANT ALL ON TABLE "public"."treatment_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_photos" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_plans" TO "anon";
GRANT ALL ON TABLE "public"."treatment_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_plans" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_protocols" TO "anon";
GRANT ALL ON TABLE "public"."treatment_protocols" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_protocols" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_records" TO "anon";
GRANT ALL ON TABLE "public"."treatment_records" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_records" TO "service_role";



GRANT ALL ON TABLE "public"."treatment_sessions" TO "anon";
GRANT ALL ON TABLE "public"."treatment_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."treatment_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."usage_tracking" TO "anon";
GRANT ALL ON TABLE "public"."usage_tracking" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_tracking" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_replay_cache" TO "anon";
GRANT ALL ON TABLE "public"."webhook_replay_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_replay_cache" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







