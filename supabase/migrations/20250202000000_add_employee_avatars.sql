-- Add avatar_url column to employees table
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS avatar_url TEXT;
-- Create storage bucket for avatars if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
-- Set up RLS for avatars bucket
-- 1. Everyone can view avatars
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR
SELECT USING (bucket_id = 'avatars');
-- 2. Authenticated users can upload avatars to their salon's folder
-- We'll assume a structure like: avatars/salon_id/employee_id.extension
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
CREATE POLICY "Users can upload avatars" ON storage.objects FOR
INSERT TO authenticated WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name)) [1] IN (
            SELECT salon_id::text
            FROM public.profiles
            WHERE user_id = auth.uid()
        )
    );
-- 3. Users can update/delete their own salon's avatars
DROP POLICY IF EXISTS "Users can update/delete avatars" ON storage.objects;
CREATE POLICY "Users can update/delete avatars" ON storage.objects FOR ALL TO authenticated USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name)) [1] IN (
        SELECT salon_id::text
        FROM public.profiles
        WHERE user_id = auth.uid()
    )
);

