# SimpliSalon — Multi-Tenant Architecture

Version: 2.0
Status: Target Architecture

---

## 1. Tenancy Model

SimpliSalon is a **multi-tenant SaaS** platform. Each tenant is a **salon** (business). Within a salon, multiple users (owner, managers, employees) share access to that tenant's data.

The tenancy model is:
- **1 tenant = 1 salon** — a tenant is the unit of data isolation, billing, and configuration
- **1 user = 1 tenant** — a user belongs to exactly one salon
- **Multi-location (future)** — a future model where one organisational entity owns multiple salons, with centralised reporting but separate operational data per location

---

## 2. Tenant Isolation Strategy

The platform uses a **shared database, shared schema** model with **Row Level Security (RLS)** for tenant isolation.

### Why Shared Schema + RLS

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Separate database per tenant | Perfect isolation, simple queries | Operational nightmare (migrations × tenants), cost prohibitive | Not suitable |
| Separate schema per tenant | Good isolation | Schema migration complexity across all schemas | Not suitable for current team |
| Shared schema + RLS | Simple operations, single migration path, enforced by DB | Requires discipline; RLS bugs = cross-tenant exposure | **Chosen approach** |

For the current team size and tenant count, shared schema + RLS is the pragmatic and correct choice. The decision is revisited if a tier-1 enterprise customer requires physical data separation.

---

## 3. How Tenant Isolation Is Enforced

### 3.1 Every Tenant-Scoped Table Has a `salon_id` Column

```sql
CREATE TABLE bookings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id   UUID NOT NULL REFERENCES salons(id),
  -- ... other columns
);
```

There are no exceptions. Any table that contains tenant data must have a `salon_id` column.

### 3.2 RLS Is Enabled on Every Tenant-Scoped Table

```sql
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Default deny: no access unless a policy grants it
CREATE POLICY "Bookings: deny by default"
  ON bookings
  USING (false);

-- Allow read for users of the same salon:
CREATE POLICY "Bookings: select own salon"
  ON bookings FOR SELECT
  USING (salon_id = public.get_user_salon_id());

-- Allow insert within own salon:
CREATE POLICY "Bookings: insert own salon"
  ON bookings FOR INSERT
  WITH CHECK (salon_id = public.get_user_salon_id());

-- Allow update within own salon:
CREATE POLICY "Bookings: update own salon"
  ON bookings FOR UPDATE
  USING (salon_id = public.get_user_salon_id())
  WITH CHECK (salon_id = public.get_user_salon_id());
```

### 3.3 Helper Functions for RLS Policies

```sql
-- Returns the salon_id from the current user's JWT claims
CREATE FUNCTION public.get_user_salon_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'salon_id')::uuid;
$$;

-- Returns true if the current user has the specified role
CREATE FUNCTION public.has_salon_role(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') = required_role;
$$;
```

These functions are called within RLS policies. They extract tenant context from the JWT — no application code is needed.

### 3.4 The Service Role Client Bypasses RLS

The `createAdminSupabaseClient()` uses the service role key, which bypasses RLS. This is used only for:
- CRON job processing (where the request is not user-scoped)
- Webhook handlers (incoming from external services)
- Billing operations triggered by payment events

In these contexts, the application code is responsible for applying tenant scope manually (every query includes `WHERE salon_id = tenantId`). This is enforced by code review policy.

---

## 4. Tenant Context Resolution

When an authenticated request arrives:

```
Request with JWT cookie
    │
    ▼
getAuthContext():
    1. supabase.auth.getUser() — validates JWT, extracts claims
    2. claims.app_metadata.salon_id → salonId
    3. Validates that URL slug matches salonId
       (prevents user from accessing a different salon's dashboard via URL manipulation)
    4. Returns AuthContext { user, salonId, role, permissions }
    │
    ▼
All subsequent database operations via the USER client automatically
enforce RLS with the resolved salonId from JWT claims.
```

The URL slug (`[slug]` in App Router paths) is the human-readable tenant identifier. The `salon_id` UUID is the canonical identifier used in all database queries. The slug → UUID mapping is verified on each request to prevent tenant confusion attacks.

---

## 5. Tenant Configuration

Each tenant has its own configuration:

| Configuration | Storage | Isolation |
|---|---|---|
| Notification settings | `salons.notification_settings JSONB` | Tenant-scoped column |
| Feature flags | `feature_flags` table with `salon_id` FK | RLS enforced |
| Integration credentials | `integration_configs` with `salon_id` FK, encrypted | RLS + encryption |
| Form templates | `form_templates` with `salon_id` FK | RLS enforced |
| Message templates | `message_templates` with `salon_id` FK | RLS enforced |
| Appearance/theme | `salons.theme_settings JSONB` | Tenant-scoped column |
| Business details | `salons.*` columns | One row per tenant |

Tenants cannot see or modify each other's configuration. The RLS policies on all configuration tables enforce this at the database level.

---

## 6. Tenant Onboarding

When a new salon is created:

1. Create record in `salons` table
2. Create user in Supabase Auth
3. Create `profiles` record linking user to salon with `owner` role
4. `sync_user_claims` trigger fires on profiles INSERT → updates JWT claims
5. Set default `notification_settings` (all automations OFF — must be explicitly enabled)
6. Create default feature flags based on the initial subscription plan
7. Seed default message templates from the built-in library

The default state is: all automations disabled, no integrations connected, no custom templates. The owner is onboarded into a clean, safe initial state.

---

## 7. Tenant Data Export and Deletion

### 7.1 Data Export

Tenants can export their data via the admin interface (owner role required). The export includes:
- Client profiles (PII)
- Booking history
- Form submissions (health data — note: exported in decrypted form, secured by the export download link)
- Message history
- Invoice records

Exports are generated asynchronously, stored in Supabase Storage under a signed URL with a 30-minute expiry, and the link is emailed to the owner.

### 7.2 Tenant Deletion

Tenant deletion (account closure) follows this sequence:
1. Subscription cancelled
2. All automation and CRON processing for the tenant suspended
3. Data export generated and offered (30-day retention)
4. After 30 days: hard delete cascade on all tenant data (triggers via `ON DELETE CASCADE` on `salon_id` FK)
5. Encryption keys for the tenant's health data destroyed (GDPR right to erasure for health data)
6. Supabase Auth users for the salon deactivated

Audit logs are retained separately for the mandatory retention period (5 years) even after tenant deletion.

---

## 8. Multi-Location Model (Future — L2)

As larger salon chains adopt SimpliSalon, the single-tenant-per-salon model needs to extend to a **multi-location model**:

```
Organisation (parent tenant)
    ├── Location A (child tenant)
    ├── Location B (child tenant)
    └── Location C (child tenant)
```

**Design constraints for future multi-location:**
- Each location retains separate operational data (bookings, clients, employees)
- An organisation-level user (role: `org_admin`) can view aggregated reports across locations
- Clients can be shared across locations within the same organisation (shared client profile)
- Billing is at the organisation level (one subscription, multiple locations)

**Implementation approach (when needed):**
- Add an `organisation_id` column to `salons`
- Create `organisation_admins` table
- New RLS policies for org-level cross-location read access
- New permission: `org:reports:view`
- Dashboard route: `/org/[orgSlug]/reports/`

This change does not require schema restructuring — it is additive. The single-tenant model continues to work unchanged.

---

## 9. Tenant Isolation Testing

Tenant isolation must be verified in automated tests:

- **Cross-tenant read test:** Create two tenants, create data in tenant A, authenticate as tenant B, attempt to query tenant A's data — must return empty result
- **Cross-tenant write test:** Authenticate as tenant B, attempt to insert data with tenant A's salon_id — must be rejected by RLS
- **RLS bypass test:** Attempt to use the anon role to access tenant data — must return empty result
- **JWT manipulation test:** Manually craft a JWT with a different salon_id — must be rejected by Supabase's signature validation

These tests are part of the integration test suite and run against a real Supabase test instance.
