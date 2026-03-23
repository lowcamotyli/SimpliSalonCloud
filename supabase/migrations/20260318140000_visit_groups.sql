-- Create the visit_groups table
CREATE TABLE public.visit_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'in_progress', 'completed', 'cancelled')),
    payment_method TEXT,
    total_price NUMERIC(10, 2),
    total_duration INTEGER,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.visit_groups IS 'Groups multiple bookings into a single visit.';

-- Add foreign key to bookings table
ALTER TABLE public.bookings
ADD COLUMN visit_group_id UUID REFERENCES public.visit_groups(id) ON DELETE SET NULL;

-- Add Row Level Security for visit_groups
ALTER TABLE public.visit_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to own salon"
ON public.visit_groups
FOR ALL
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

-- Create indexes for performance
CREATE INDEX idx_visit_groups_salon_id_status ON public.visit_groups(salon_id, status);
CREATE INDEX idx_bookings_visit_group_id ON public.bookings(visit_group_id);
