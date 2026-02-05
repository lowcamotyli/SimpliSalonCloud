-- Move user profile to salon ANASTAZJA
-- User: d6779354-2658-4129-900b-7d75e6e3dfc2
-- Target salon_id: f5d0f479-5959-4cf8-8a3f-24f63a981f9b

UPDATE public.profiles
SET salon_id = 'f5d0f479-5959-4cf8-8a3f-24f63a981f9b',
    updated_at = NOW()
WHERE user_id = 'd6779354-2658-4129-900b-7d75e6e3dfc2';
