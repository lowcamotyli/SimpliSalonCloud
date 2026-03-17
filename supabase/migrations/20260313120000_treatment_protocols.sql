-- Create the treatment_protocols table
CREATE TABLE public.treatment_protocols (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
    name text NOT NULL,
    description text,
    version integer NOT NULL DEFAULT 1,
    fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add comments to the table and columns for clarity
COMMENT ON TABLE public.treatment_protocols IS 'Stores treatment protocols and forms for services.';
COMMENT ON COLUMN public.treatment_protocols.fields IS 'Array of form field definitions: { id: string, label: string, type: ''text''|''number''|''select''|''boolean'', options?: string[], required: boolean }';

-- Create indexes for performance
CREATE INDEX ix_treatment_protocols_salon_id_service_id ON public.treatment_protocols(salon_id, service_id);
CREATE INDEX ix_treatment_protocols_salon_id_is_active ON public.treatment_protocols(salon_id, is_active);

-- Function to handle updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on row modification
CREATE TRIGGER on_treatment_protocols_updated
BEFORE UPDATE ON public.treatment_protocols
FOR EACH ROW
EXECUTE PROCEDURE public.handle_updated_at();

-- Enable Row Level Security
ALTER TABLE public.treatment_protocols ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- 1. SELECT: Allow salon members to read protocols.
CREATE POLICY "Allow read for salon members"
ON public.treatment_protocols
FOR SELECT
USING (salon_id = public.get_user_salon_id());

-- 2. INSERT: Allow owners and managers to create protocols.
CREATE POLICY "Allow insert for salon owner/manager"
ON public.treatment_protocols
FOR INSERT
WITH CHECK (
  salon_id = public.get_user_salon_id() AND
  public.has_any_salon_role(ARRAY['owner', 'manager'])
);

-- 3. UPDATE: Allow owners and managers to update protocols.
CREATE POLICY "Allow update for salon owner/manager"
ON public.treatment_protocols
FOR UPDATE
USING (
  salon_id = public.get_user_salon_id()
)
WITH CHECK (
  public.has_any_salon_role(ARRAY['owner', 'manager'])
);

-- 4. DELETE: Allow only owners to delete protocols.
CREATE POLICY "Allow delete for salon owner"
ON public.treatment_protocols
FOR DELETE
USING (
  salon_id = public.get_user_salon_id() AND
  public.has_salon_role('owner')
);
