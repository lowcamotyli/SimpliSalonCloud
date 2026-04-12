-- Repair: storage policies for service-media bucket (failed in 20260413000001)

DROP POLICY IF EXISTS "service_media_storage_insert_auth" ON storage.objects;
CREATE POLICY "service_media_storage_insert_auth"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'service-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "service_media_storage_update_auth" ON storage.objects;
CREATE POLICY "service_media_storage_update_auth"
ON storage.objects FOR UPDATE
USING (bucket_id = 'service-media' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'service-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "service_media_storage_delete_auth" ON storage.objects;
CREATE POLICY "service_media_storage_delete_auth"
ON storage.objects FOR DELETE
USING (bucket_id = 'service-media' AND auth.role() = 'authenticated');
