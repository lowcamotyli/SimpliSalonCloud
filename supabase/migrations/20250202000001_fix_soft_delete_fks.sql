-- ========================================
-- FIX: UPDATE DELETED_BY FOREIGN KEYS
-- Change deleted_by to reference auth.users(id) instead of profiles(id)
-- ========================================
-- 1. Bookings
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_deleted_by_fkey;
ALTER TABLE bookings
ADD CONSTRAINT bookings_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id);
-- 2. Clients
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_deleted_by_fkey;
ALTER TABLE clients
ADD CONSTRAINT clients_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id);
-- 3. Employees
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_deleted_by_fkey;
ALTER TABLE employees
ADD CONSTRAINT employees_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id);
-- 4. Services
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_deleted_by_fkey;
ALTER TABLE services
ADD CONSTRAINT services_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id);
-- 5. Salons
ALTER TABLE salons DROP CONSTRAINT IF EXISTS salons_deleted_by_fkey;
ALTER TABLE salons
ADD CONSTRAINT salons_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id);
-- 6. Payroll Runs
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_deleted_by_fkey;
ALTER TABLE payroll_runs
ADD CONSTRAINT payroll_runs_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id);
-- Ensure all soft delete functions are using auth.uid() correctly (they already do, but just in case)
CREATE OR REPLACE FUNCTION soft_delete_employee() RETURNS TRIGGER AS $$ BEGIN
UPDATE employees
SET deleted_at = NOW(),
    deleted_by = auth.uid()
WHERE id = OLD.id;
RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Ensure trigger exists
DROP TRIGGER IF EXISTS soft_delete_employees_trigger ON employees;
CREATE TRIGGER soft_delete_employees_trigger BEFORE DELETE ON employees FOR EACH ROW EXECUTE FUNCTION soft_delete_employee();

