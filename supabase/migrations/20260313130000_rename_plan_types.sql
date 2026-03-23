-- Rename plan types: starter→solo, professional→studio, business→clinic
-- Enterprise stays unchanged.

-- 1. Drop existing CHECK constraints
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;
ALTER TABLE salons DROP CONSTRAINT IF EXISTS salons_subscription_plan_check;

-- 2. Migrate existing data
UPDATE subscriptions SET plan_type = 'solo'   WHERE plan_type = 'starter';
UPDATE subscriptions SET plan_type = 'studio' WHERE plan_type = 'professional';
UPDATE subscriptions SET plan_type = 'clinic' WHERE plan_type = 'business';

UPDATE salons SET subscription_plan = 'solo'   WHERE subscription_plan = 'starter';
UPDATE salons SET subscription_plan = 'studio' WHERE subscription_plan = 'professional';
UPDATE salons SET subscription_plan = 'clinic' WHERE subscription_plan = 'business';

-- 3. Re-add constraints with new values
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_type_check
  CHECK (plan_type IN ('solo', 'studio', 'clinic', 'enterprise'));

ALTER TABLE salons
  ADD CONSTRAINT salons_subscription_plan_check
  CHECK (subscription_plan IN ('solo', 'studio', 'clinic', 'enterprise'));

-- 4. Update default
ALTER TABLE salons ALTER COLUMN subscription_plan SET DEFAULT 'solo';
