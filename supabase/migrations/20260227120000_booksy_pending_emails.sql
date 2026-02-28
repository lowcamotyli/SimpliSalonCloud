-- ============================================================
-- booksy_pending_emails
-- Stores Booksy emails that could not be auto-processed
-- (service not found, employee not found, parse failed)
-- so the salon owner can manually action them.
-- ============================================================

CREATE TABLE IF NOT EXISTS booksy_pending_emails (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id        uuid        NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  message_id      text        NOT NULL,               -- Gmail message ID
  subject         text,
  body_snippet    text,                               -- first 2000 chars
  parsed_data     jsonb,                              -- what was successfully parsed
  failure_reason  text        NOT NULL DEFAULT 'other'
                  CHECK (failure_reason IN ('parse_failed','service_not_found','employee_not_found','other')),
  failure_detail  text,
  status          text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','resolved','ignored')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  UNIQUE (salon_id, message_id)
);

CREATE INDEX idx_booksy_pending_salon_status
  ON booksy_pending_emails (salon_id, status);

-- RLS
ALTER TABLE booksy_pending_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salon_members_select_pending_emails"
  ON booksy_pending_emails FOR SELECT
  USING (salon_id = public.get_user_salon_id());

CREATE POLICY "salon_members_update_pending_emails"
  ON booksy_pending_emails FOR UPDATE
  USING (salon_id = public.get_user_salon_id());
