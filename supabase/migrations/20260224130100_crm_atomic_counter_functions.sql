-- CRM Batch 4 remediation: atomic counter increment helpers

CREATE OR REPLACE FUNCTION public.crm_increment_campaign_counter(
  p_campaign_id UUID,
  p_counter_name TEXT,
  p_increment_by INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.crm_increment_usage_counter(
  p_salon_id UUID,
  p_period_month TEXT,
  p_channel TEXT,
  p_increment_by INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
