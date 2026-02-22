-- Ensure new salons comply with tightened subscription_plan constraint
ALTER TABLE public.salons
  ALTER COLUMN subscription_plan SET DEFAULT 'starter';

