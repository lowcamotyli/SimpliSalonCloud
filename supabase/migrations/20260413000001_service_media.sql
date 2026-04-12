CREATE TABLE IF NOT EXISTS public.service_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_media_service_id_sort_order_key UNIQUE (service_id, sort_order) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS service_media_salon_id_service_id_idx
  ON public.service_media (salon_id, service_id);

CREATE INDEX IF NOT EXISTS service_media_service_id_sort_order_idx
  ON public.service_media (service_id, sort_order);

ALTER TABLE public.service_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_media_select_public" ON public.service_media;
CREATE POLICY "service_media_select_public"
ON public.service_media
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "service_media_insert_own_salon" ON public.service_media;
CREATE POLICY "service_media_insert_own_salon"
ON public.service_media
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "service_media_update_own_salon" ON public.service_media;
CREATE POLICY "service_media_update_own_salon"
ON public.service_media
FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "service_media_delete_own_salon" ON public.service_media;
CREATE POLICY "service_media_delete_own_salon"
ON public.service_media
FOR DELETE
USING (salon_id = public.get_user_salon_id());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('service-media', 'service-media', true, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "service_media_storage_select_public" ON storage.objects;
CREATE POLICY "service_media_storage_select_public"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'service-media' AND
  true
);

DROP POLICY IF EXISTS "service_media_storage_insert_auth" ON storage.objects;
CREATE POLICY "service_media_storage_insert_auth"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'service-media' AND
  auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "service_media_storage_update_auth" ON storage.objects;
CREATE POLICY "service_media_storage_update_auth"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'service-media' AND
  auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'service-media' AND
  auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "service_media_storage_delete_auth" ON storage.objects;
CREATE POLICY "service_media_storage_delete_auth"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'service-media' AND
  auth.role() = 'authenticated'
);
