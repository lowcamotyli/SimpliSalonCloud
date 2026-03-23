ALTER TABLE public.visit_groups
DROP CONSTRAINT IF EXISTS visit_groups_status_check;

ALTER TABLE public.visit_groups
ADD CONSTRAINT visit_groups_status_check
CHECK (status IN ('draft', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'));
