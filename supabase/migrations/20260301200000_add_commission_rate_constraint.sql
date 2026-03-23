-- fix existing bad data
UPDATE employees SET commission_rate = 1.0 WHERE commission_rate > 1;
-- add constraint
ALTER TABLE employees DROP CONSTRAINT IF EXISTS chk_commission_rate;
ALTER TABLE employees ADD CONSTRAINT chk_commission_rate CHECK (commission_rate >= 0 AND commission_rate <= 1);
