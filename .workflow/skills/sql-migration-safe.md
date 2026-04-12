# skill:sql-migration-safe

## Purpose
Handle schema and data migrations conservatively, explicitly, and with full rollback awareness.
This is not "dad knows SQL" — it is an explicit, auditable procedure for production-impacting database work.

## Use When
- New table, column, index, or constraint
- Data backfill or correction
- Schema alteration (`ALTER TABLE`, `DROP COLUMN`, `RENAME`)
- RLS policy creation or modification
- Any database change with production impact

## Do Not Use When
- Change is app-level only (no schema or data change) → use `skill:scoped-implementation`
- Change is a read-only view or `SELECT` query → normal implementation applies

## Required Inputs
- Target table(s) and exact change description
- Idempotency requirement (yes / no)
- Rollback posture (what undo looks like, even if not scripted)
- Whether `supabase gen types` is needed after push

## Procedure
1. Read: existing migration file naming convention + latest 2 migration files
2. Run `supabase migration list --linked` — confirm no drift before writing (drift now = conflict at push)
3. Check current schema state for affected tables
4. Write migration SQL:
   - One logical change per file
   - Filename: `YYYYMMDDHHMMSS_<descriptive-name>.sql`
   - RLS policy on every new table — no exceptions
   - Index on FK columns and all columns used in `WHERE` / `ORDER BY`
   - multi-tenant tables: `salon_id` column + RLS using `get_user_salon_id()`
5. State rollback posture (what reverse migration looks like)
6. Assess: rows affected, lock risk, backfill size, constraint violation risk
7. **Wait for Claude explicit approval before `supabase db push`** on any destructive migration
8. After approval:
   ```bash
   supabase db push
   supabase gen types typescript --linked > types/supabase.ts
   npx tsc --noEmit
   ```

## Expected Outputs
- Migration file path + content summary
- Risk notes: lock risk, data impact, backward compatibility
- Rollback / recovery notes
- Validation plan (what to verify after push)
- tsc result after type regeneration

## Validation
```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
```

## Escalate When
- Migration is destructive (`DROP TABLE`, `DROP COLUMN`, bulk `DELETE`)
- Backfill affects large table (>10k rows) — lock risk on Postgres
- RLS policy change affects existing data access patterns
- Migration conflicts with existing data (constraint violation risk)
- `supabase migration list --linked` shows drift before push

## Context Budget Guidance
- Read: affected table definitions + last 2 migration files for naming/pattern
- Do not read full migration history unless diagnosing drift
- For RLS design: consult `docs/architecture/multi-tenant-architecture.md` via `skill:large-context-analysis`

## Safety Constraints
- **Claude must explicitly approve before `supabase db push` on destructive migrations**
- Every new table MUST have RLS enabled (`ALTER TABLE x ENABLE ROW LEVEL SECURITY`)
- Never use `service_role` key in migration code
- No `DELETE FROM table` without `WHERE` clause
- Multi-tenant tables require `salon_id NOT NULL` + RLS policy filtering via `public.get_user_salon_id()`
- Helper functions to use (do not recreate): `get_user_salon_id()`, `has_salon_role()`, `has_any_salon_role()`
