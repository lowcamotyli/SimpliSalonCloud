INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('treatment-photos', 'treatment-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "treatment_photos_select" ON storage.objects;
CREATE POLICY "treatment_photos_select" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'treatment-photos' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = public.get_user_salon_id()::text
);

DROP POLICY IF EXISTS "treatment_photos_insert" ON storage.objects;
CREATE POLICY "treatment_photos_insert" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'treatment-photos' AND
  auth.role() = 'authenticated' AND
  public.has_any_salon_role(ARRAY['owner','manager','employee']) AND
  (storage.foldername(name))[1] = public.get_user_salon_id()::text
);

DROP POLICY IF EXISTS "treatment_photos_delete" ON storage.objects;
CREATE POLICY "treatment_photos_delete" ON storage.objects
FOR DELETE
USING (
  bucket_id = 'treatment-photos' AND
  auth.role() = 'authenticated' AND
  public.has_any_salon_role(ARRAY['owner','manager']) AND
  (storage.foldername(name))[1] = public.get_user_salon_id()::text
);
