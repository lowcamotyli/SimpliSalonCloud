# 🔐 Row Level Security (RLS) - Deployment Guide

## 📋 Overview

This guide will walk you through deploying Row Level Security to your SimpliSalon Cloud Supabase database.

**CRITICAL:** RLS is the **most important security feature** for multi-tenant applications. Without it, users could potentially access data from other salons.

---

## 🚀 Quick Start (Recommended Method)

> [!WARNING]
> **CRITICAL PREREQUISITE: Employee User Link**
>
> Migration `20250127000004_add_employee_user_link.sql` MUST be applied BEFORE any RLS migrations.
> This adds the `user_id` column to the `employees` table, which is required by RLS helper functions.
> 
> **If you skip this migration, all RLS migrations will FAIL!**

### Option 1: Apply via Supabase Dashboard (Easiest)

1. **Open Supabase Dashboard**
   - Go to [https://app.supabase.com](https://app.supabase.com)
   - Select your SimpliSalon Cloud project

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar

3. **Apply Migrations in Order**
   
   Execute the following files **ONE BY ONE** in this exact order:

   ```
   ✅ Step 1: supabase/migrations/20250127000004_add_employee_user_link.sql (CRITICAL - must run first!)
   ✅ Step 2: supabase/migrations/20250128000000_rls_helper_functions.sql
   ✅ Step 3: supabase/migrations/20250128000001_rls_salons.sql
   ✅ Step 4: supabase/migrations/20250128000002_rls_clients.sql
   ✅ Step 5: supabase/migrations/20250128000003_rls_bookings.sql
   ✅ Step 6: supabase/migrations/20250128000004_rls_services.sql
   ✅ Step 7: supabase/migrations/20250128000005_rls_employees.sql
   ✅ Step 8: supabase/migrations/20250128000006_rls_settings_integrations.sql
   ✅ Step 9: supabase/migrations/20250128000007_rls_profiles.sql
   ✅ Step 10: supabase/migrations/20250128000008_rls_payroll.sql
   ```

   **IMPORTANT:** Migration 20250127000004 MUST run before any RLS migrations!
   
   For each file:
   - Copy the entire content
   - Paste into SQL Editor
   - Click "Run" button
   - Verify "Success" message
   - Move to next file

4. **Verify RLS is Active**
   
   Run this query in SQL Editor:
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND tablename IN ('salons', 'clients', 'bookings', 'services', 'employees', 'profiles');
   ```
   
   **Expected result:** All tables should have `rowsecurity = true`

---

## 🧪 Testing RLS

### Quick Test

Run this in SQL Editor to verify tenant isolation:

```sql
-- Test helper functions
SELECT auth.get_user_salon_id() as my_salon;
SELECT auth.has_salon_role('owner') as is_owner;

-- Test data isolation (as logged-in user)
SELECT COUNT(*) FROM salons;  -- Should return 1 (only your salon)
SELECT COUNT(*) FROM clients; -- Should return only your clients
```

### Comprehensive Test

For a full test suite, run `supabase/test_rls.sql` in the SQL Editor.

⚠️ **NOTE:** The test file creates temporary test data. It uses a ROLLBACK at the end to clean up.

---

## 📊 What Each Migration Does

### 🔗 Migration 000004 (20250127): Employee User Link (PREREQUISITE)
Adds `user_id` column to employees table, linking employees to auth.users.
**CRITICAL:** Must run before any RLS migrations!
**NOTE:** The script attempts to link existing employees by email. If emails don't match, you must link them manually.

### 🔧 Migration 000000 (20250128): Helper Functions
Creates 4 SQL functions that RLS policies use:
- `auth.get_user_salon_id()` - Gets user's salon
- `auth.has_salon_role()` - Checks specific role
- `auth.has_any_salon_role()` - Checks multiple roles
- `auth.get_user_employee_id()` - Gets employee ID

### 🏢 Migration 000001: Salons RLS
- Users see ONLY their salon
- Only owners can update salon
- No create/delete via API

### 👥 Migration 000002: Clients RLS
- All salon members can view/create/update clients
- Only owner/manager can delete clients

### 📅 Migration 000003: Bookings RLS  
- All salon members can view all bookings
- All can create bookings
- Owner/Manager can update all bookings
- Employees can update only THEIR bookings
- Only owner/manager can delete

### 💇 Migration 000004: Services RLS
- All can view services
- Only owner/manager can create/update/delete

### 👔 Migration 000005: Employees RLS
- All can view employees
- Only owner/manager can create/update/delete

### ⚙️ Migration 000006: Settings & Integrations RLS
- All can view settings and integrations
- Only owner can create/update/delete

### 👤 Migration 000007: Profiles RLS
- Users see only profiles from their salon
- Users can update only their own profile
- Cannot change salon_id

### 💰 Migration 000008: Payroll RLS
- Only owner can view/create/update payroll runs
- Only owner can manage payroll entries
- Employees can view only their own payroll entries
- All operations filtered by salon_id

---

## ✅ Post-Deployment Checklist

After applying all migrations, verify:

- [ ] Employee user_id column exists (run `\d employees` in SQL Editor)
- [ ] All 10 migrations applied successfully (no errors)
- [ ] RLS enabled on all tables (run verification query above)
- [ ] Helper functions exist (run `\df auth.*` in SQL Editor)
- [ ] Test basic queries work (SELECT from clients, bookings, etc.)
- [ ] Application still works (check frontend)
- [ ] Employee bookings editing works (test as employee user)

---

## 🔍 Troubleshooting

### Issue: "function auth.get_user_salon_id() does not exist"
**Solution:** Make sure you applied migration 000000_rls_helper_functions.sql FIRST

### Issue: "no policy allows for SELECT on table X"
**Solution:** 
1. Verify you're logged in (query `SELECT auth.uid()` should return your user ID)
2. Verify your profile has a `salon_id` (query `SELECT * FROM profiles WHERE user_id = auth.uid()`)

### Issue: Queries return 0 results
**Solution:**
1. Check if your user has `salon_id` in profiles table
2. Make sure the data you're querying belongs to your salon
3. Verify RLS is enabled: `SELECT * FROM pg_tables WHERE tablename = 'clients' AND rowsecurity = true`

### Issue: "insufficient_privilege" error
**Solution:** Check your role in profiles table. Some operations require owner or manager role.

---

## 🛡️ Security Best Practices

### DO ✅
- Always test RLS after deploying
- Keep RLS enabled in production
- Test with different user roles (owner, manager, employee)
- Regularly audit RLS policies

### DON'T ❌
- Never disable RLS in production
- Never delete RLS policies
- Never bypass RLS with service role key in client code
- Don't trust application-level security alone

---

## 🔄 Rolling Back (Emergency Only)

If you need to disable RLS (NOT RECOMMENDED for production):

```sql
-- Emergency rollback - ONLY for troubleshooting
ALTER TABLE salons DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE services DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE salon_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE salon_integrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
```

⚠️ **WARNING:** This will remove all security! Only use temporarily for debugging.

---

## 📖 Additional Resources

- Full documentation: `docs/RLS-RULES.md`
- Test suite: `supabase/test_rls.sql`
- Supabase RLS docs: https://supabase.com/docs/guides/auth/row-level-security

---

## 🎯 Expected Impact

### Security
- ✅ Complete data isolation between salons
- ✅ Role-based access control (owner/manager/employee)
- ✅ Employee scope for bookings
- ✅ Protection against SQL injection attempts

### Performance
- 📈 Minimal impact (< 5% overhead)
- 📈 Existing indexes will be used by RLS
- 📈 Helper functions are optimized with STABLE SECURITY DEFINER

### Application Changes
- ✅ No changes required in frontend code
- ✅ Existing queries will work (RLS filters automatically)
- ✅ Can optionally remove redundant salon_id filters from application

---

## ☎️ Support

If you encounter issues:
1. Check troubleshooting section above
2. Review RLS-RULES.md for detailed policy explanations
3. Run test_rls.sql to identify which policies are failing
4. Check Supabase logs for detailed error messages

---

**Last Updated:** January 28, 2025  
**Version:** 1.0
