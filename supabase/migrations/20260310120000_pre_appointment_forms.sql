-- Add column to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pre_form_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- Create pre_appointment_responses table
CREATE TABLE IF NOT EXISTS pre_appointment_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  form_template_id TEXT NOT NULL DEFAULT 'pre_appointment',
  answers JSONB,
  fill_token TEXT UNIQUE,
  fill_token_exp TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pre_appointment_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to select responses for their salon"
ON pre_appointment_responses
FOR SELECT
TO authenticated
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow service role to insert responses"
ON pre_appointment_responses
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Allow service role to update responses"
ON pre_appointment_responses
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pre_appointment_responses_salon_submitted ON pre_appointment_responses (salon_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_pre_appointment_responses_fill_token ON pre_appointment_responses (fill_token);
