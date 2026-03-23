CREATE TABLE IF NOT EXISTS public.treatment_photos (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    treatment_record_id uuid NOT NULL REFERENCES public.treatment_records(id) ON DELETE CASCADE,
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    storage_path text NOT NULL,
    photo_type text NOT NULL CHECK (photo_type IN ('before', 'after', 'during', 'other')),
    taken_at timestamptz NOT NULL DEFAULT now(),
    notes text,
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treatment_photos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS ix_treatment_photos_treatment_record_id ON public.treatment_photos(treatment_record_id);
CREATE INDEX IF NOT EXISTS ix_treatment_photos_salon_id_client_id ON public.treatment_photos(salon_id, client_id);

DROP POLICY IF EXISTS "Allow salon users to view treatment photos" ON public.treatment_photos;
CREATE POLICY "Allow salon users to view treatment photos"
ON public.treatment_photos
FOR SELECT
USING (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "Allow employees to insert treatment photos" ON public.treatment_photos;
CREATE POLICY "Allow employees to insert treatment photos"
ON public.treatment_photos
FOR INSERT
WITH CHECK (
    salon_id = public.get_user_salon_id() AND
    public.has_any_salon_role(ARRAY['owner', 'manager', 'employee'])
);

DROP POLICY IF EXISTS "Allow managers to delete treatment photos" ON public.treatment_photos;
CREATE POLICY "Allow managers to delete treatment photos"
ON public.treatment_photos
FOR DELETE
USING (
    salon_id = public.get_user_salon_id() AND
    public.has_any_salon_role(ARRAY['owner', 'manager'])
);
