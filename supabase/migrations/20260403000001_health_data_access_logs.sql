-- Create the health_data_access_logs table
CREATE TABLE public.health_data_access_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    accessed_by uuid NOT NULL REFERENCES auth.users(id),
    accessed_by_role text NOT NULL,
    resource_type text NOT NULL CHECK (resource_type IN ('form_response', 'treatment_record', 'treatment_photo')),
    resource_id uuid NOT NULL,
    client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
    data_category text NOT NULL CHECK (data_category IN ('health', 'sensitive_health')),
    action text NOT NULL CHECK (action IN ('decrypt', 'view', 'export')),
    accessed_at timestamptz NOT NULL DEFAULT now(),
    ip_address text,
    user_agent text
);

-- Add comments to the table and columns
COMMENT ON TABLE public.health_data_access_logs IS 'Append-only log for auditing access to sensitive client health data.';
COMMENT ON COLUMN public.health_data_access_logs.salon_id IS 'The salon where the access occurred.';
COMMENT ON COLUMN public.health_data_access_logs.accessed_by IS 'The user who accessed the data.';
COMMENT ON COLUMN public.health_data_access_logs.accessed_by_role IS 'The role of the user at the time of access.';
COMMENT ON COLUMN public.health_data_access_logs.resource_type IS 'The type of resource that was accessed.';
COMMENT ON COLUMN public.health_data_access_logs.resource_id IS 'The unique identifier of the accessed resource.';
COMMENT ON COLUMN public.health_data_access_logs.client_id IS 'The client whose data was accessed.';
COMMENT ON COLUMN public.health_data_access_logs.data_category IS 'The classification of the accessed data.';
COMMENT ON COLUMN public.health_data_access_logs.action IS 'The action performed on the data (e.g., decrypt, view, export).';
COMMENT ON COLUMN public.health_data_access_logs.accessed_at IS 'The timestamp when the access occurred.';
COMMENT ON COLUMN public.health_data_access_logs.ip_address IS 'The IP address from which the access was made.';
COMMENT ON COLUMN public.health_data_access_logs.user_agent IS 'The user agent of the client that made the request.';

-- Create indexes for performance
CREATE INDEX idx_health_logs_salon_accessed_at ON public.health_data_access_logs(salon_id, accessed_at DESC);
CREATE INDEX idx_health_logs_salon_client_id ON public.health_data_access_logs(salon_id, client_id);
CREATE INDEX idx_health_logs_salon_accessed_by ON public.health_data_access_logs(salon_id, accessed_by);

-- Enable Row-Level Security
ALTER TABLE public.health_data_access_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- SELECT policy for salon owners
CREATE POLICY "Allow salon owners to read access logs"
ON public.health_data_access_logs
FOR SELECT
TO authenticated
USING (
    salon_id = public.get_user_salon_id() AND
    public.has_salon_role('owner')
);

-- Note: No INSERT, UPDATE, or DELETE policies are created as this is an append-only table
-- populated by a service role client.
