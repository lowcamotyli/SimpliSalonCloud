CREATE TABLE public.addon_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
    duration_delta INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(salon_id, name)
);

CREATE INDEX idx_addon_templates_salon_id ON public.addon_templates(salon_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'service_addons_salon_service_name_unique'
          AND conrelid = 'public.service_addons'::regclass
    ) THEN
        ALTER TABLE public.service_addons
        ADD CONSTRAINT service_addons_salon_service_name_unique
        UNIQUE (salon_id, service_id, name);
    END IF;
END
$$;

ALTER TABLE public.addon_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "addon_templates_select"
ON public.addon_templates
FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "addon_templates_insert"
ON public.addon_templates
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "addon_templates_update"
ON public.addon_templates
FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "addon_templates_delete"
ON public.addon_templates
FOR DELETE
USING (salon_id = public.get_user_salon_id());
