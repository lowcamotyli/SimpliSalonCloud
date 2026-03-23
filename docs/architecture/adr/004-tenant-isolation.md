# ADR-004: Tenant Isolation via Row Level Security

Status: Accepted
Date: 2026-03

---

## Context

SimpliSalon is a multi-tenant SaaS platform. Client data — including booking histories, health questionnaires, consent records, and treatment photos — is extremely sensitive. A cross-tenant data leak is one of the most severe failure modes possible: it would violate GDPR, damage trust, and potentially result in legal liability.

The team must decide how to enforce tenant isolation in the database layer.

The options:

1. **Separate database per tenant** — each tenant gets a dedicated Postgres instance
2. **Separate schema per tenant** — all tenants in the same database instance, separate Postgres schemas
3. **Shared schema with RLS** — all tenants in the same schema; Row Level Security policies enforce per-row isolation
4. **Application-layer isolation only** — all queries include `WHERE salon_id = ?`; no database-layer enforcement

---

## Decision

**We use Shared Schema with Row Level Security (RLS) as the primary tenant isolation mechanism.**

Every table that contains tenant-scoped data must:
1. Have a `salon_id UUID NOT NULL` column referencing `salons(id)`
2. Have `ENABLE ROW LEVEL SECURITY` applied
3. Have explicit RLS policies for SELECT, INSERT, UPDATE, and DELETE operations
4. Be included in the same migration as its RLS policies (never create a table without its RLS)

Application-layer `salon_id` filtering is used in addition to RLS, not as a replacement for it.

---

## Why RLS, Not Application-Layer Isolation Alone

Application-layer isolation (always including `WHERE salon_id = ?` in queries) is fragile because:

1. **One missed WHERE clause = cross-tenant data access.** A developer adds a new query and forgets the tenant filter. Without database-level enforcement, there is no safety net.

2. **It relies on every code path being correct, always.** RLS requires only that the RLS policies are correct — and those are centralised, auditable, and tested independently of application code.

3. **It cannot protect against a compromised database credential.** If an attacker gains the application's database user credentials, application-layer filtering is meaningless. RLS policies apply even to direct database access.

4. **It creates a hidden assumption.** A query that "happens to work" without a tenant filter becomes a latent cross-tenant bug waiting to surface. With RLS, the query returns empty results immediately, making the bug visible.

RLS is the **backstop** that makes cross-tenant access structurally impossible for the user-scoped database client. Application-layer filtering is still used for performance (it helps the query planner use indexes efficiently) and clarity, but it is not the security boundary.

---

## Alternatives Considered

### Separate Database per Tenant

**What it means:** Each salon gets its own Postgres database instance on Supabase.

**Arguments for:**
- Perfect isolation: a bug in one tenant's data cannot possibly affect another
- Tenant data can be independently backed up, migrated, and deleted
- No possibility of cross-tenant query

**Arguments against:**
- **Migration complexity is prohibitive at scale.** With 100 tenants, each schema migration requires 100 parallel migration runs. With 1,000 tenants, this becomes a serious operational problem. A failing migration on one tenant's database must be tracked and retried.
- **Cost is prohibitive.** Each Supabase project has a fixed cost. 1,000 tenants × project cost = unsustainable.
- **Supabase Auth cannot be shared across projects.** Each tenant would need separate auth infrastructure.
- **Performance monitoring and aggregation across tenants is impossible.**

**Verdict: Rejected.** Not feasible for the operational model and team size. Appropriate only for enterprise clients with specific compliance requirements that mandate physical data separation — and even then, it would be a per-enterprise override, not the default model.

### Separate Schema per Tenant

**What it means:** Single Postgres instance, but each tenant gets a dedicated Postgres schema (`tenant_a.bookings`, `tenant_b.bookings`, etc.). The application switches the search path based on the tenant.

**Arguments for:**
- Good isolation: cross-tenant access requires explicitly querying the wrong schema
- Tenant data can be independently exported (pg_dump per schema)
- Simpler than separate databases

**Arguments against:**
- **Migration complexity is still painful.** Schema migrations must be applied to every tenant schema. For 1,000 tenants, this means 1,000 DDL operations per migration.
- **Schema management tools (Supabase, most ORMs) do not support per-tenant schemas out of the box.** Custom tooling is required.
- **Performance:** The Postgres catalog becomes very large with many schemas, affecting performance of schema-related queries.
- **Supabase does not officially support this pattern.** It would require significant custom infrastructure work.

**Verdict: Rejected.** More complex than shared schema + RLS without proportional security benefit for the current scale. Revisit for multi-region enterprise deployments at L3.

### Application-Layer Isolation Only

**What it means:** Trust the application to always include the correct `salon_id` filter in every query. No database enforcement.

**Arguments for:**
- Simpler to implement: no RLS policies to write and maintain
- Easier to debug: queries are explicit about their filtering

**Arguments against:**
- **This is how cross-tenant bugs happen.** One missed WHERE clause, one incorrect JOIN, one query written by a tired developer — and one tenant's data is visible to another.
- **Zero defence in depth.** If application code is wrong, the database provides no protection.
- **Not compliant with the spirit of GDPR's security requirements.** GDPR requires "appropriate technical measures" to protect personal data. For a multi-tenant system, database-level access controls are an "appropriate technical measure".

**Verdict: Rejected as the sole isolation mechanism.** Application-layer filters are used in addition to RLS, not instead of it.

---

## Implementation Requirements

### RLS Policy Template

Every new table with tenant-scoped data must include:

```sql
-- Enable RLS
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "{table}: select own salon"
  ON {table_name} FOR SELECT
  USING (salon_id = public.get_user_salon_id());

-- INSERT
CREATE POLICY "{table}: insert own salon"
  ON {table_name} FOR INSERT
  WITH CHECK (salon_id = public.get_user_salon_id());

-- UPDATE
CREATE POLICY "{table}: update own salon"
  ON {table_name} FOR UPDATE
  USING (salon_id = public.get_user_salon_id())
  WITH CHECK (salon_id = public.get_user_salon_id());

-- DELETE (only if the table supports delete)
CREATE POLICY "{table}: delete own salon"
  ON {table_name} FOR DELETE
  USING (salon_id = public.get_user_salon_id());
```

### Tables That Are Exempt from Tenant-Scoped RLS

Some tables are intentionally not tenant-scoped:

| Table | Reason |
|---|---|
| `salons` | The tenant table itself; accessed by system only |
| `subscription_plans` | Global plans catalog; read-only for all |
| `equipment_types` | Global equipment type catalog; read-only for all |
| `audit_logs` | Append-only; special access control |

These tables still have RLS enabled, but with different policies appropriate to their nature.

### Service Role Usage Policy

The admin client (service role) bypasses RLS. Its use is restricted to explicitly listed scenarios. Every use of the admin client must:
1. Be documented with a comment explaining why user-scoped access is insufficient
2. Include an explicit `WHERE salon_id = ...` filter to scope the operation
3. Be reviewed for cross-tenant data access risk

---

## Consequences

### Positive
- Cross-tenant data access is structurally impossible for the user-scoped database client
- RLS policies are centralised and independently testable
- Defence in depth: application layer + database layer protect simultaneously
- GDPR compliance: database-level access controls are a clearly "appropriate technical measure"
- RLS is enforced even if application code has bugs

### Negative / Trade-offs
- RLS adds a small performance overhead (policy evaluation per row). For the current scale, this is negligible. For very high-frequency queries on large tables, this should be monitored.
- RLS policies must be maintained alongside table schemas. A migration that adds a new table without RLS is a security bug.
- Debugging RLS issues can be counterintuitive (a query returning empty results may indicate RLS policy blocking rather than missing data)
- The service role client, which bypasses RLS, must be strictly controlled

### Verification

Tenant isolation is verified by the integration test suite:
- Cross-tenant read must return empty results
- Cross-tenant write must be rejected
- Anon-role access to tenant data must be rejected
- Service-role access must still include explicit tenant filters in application code (even though RLS would not block it)
