DROP POLICY IF EXISTS "service_media_storage_insert_auth" ON storage.objects;
CREATE POLICY "service_media_storage_insert_auth"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'service-media' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = public.get_user_salon_id()::text
);

DROP POLICY IF EXISTS "service_media_storage_update_auth" ON storage.objects;
CREATE POLICY "service_media_storage_update_auth"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'service-media' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = public.get_user_salon_id()::text
)
WITH CHECK (
  bucket_id = 'service-media' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = public.get_user_salon_id()::text
);

DROP POLICY IF EXISTS "service_media_storage_delete_auth" ON storage.objects;
CREATE POLICY "service_media_storage_delete_auth"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'service-media' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = public.get_user_salon_id()::text
);
