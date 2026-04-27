# Sprint AF-03 — workspace_modules DB + Module Gating Middleware

## Cel
(P0) Tabela `workspace_modules` (runtime enablement per tenant) oraz middleware
sprawdzający aktywność modułu przed route handlerem. Po tym sprincie wyłączony
moduł zwraca 404/redirect zanim cokolwiek wykona.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/SECURITY.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/DB-SCHEMA.md. List: (1) workspace_modules table schema, (2) module gating middleware pattern, (3) RLS requirements for workspace_modules. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/SECURITY.md` | Module gating middleware, getAuthContext pattern |
| `docs/AppForge/DB-SCHEMA.md` | workspace_modules table schema + RLS wzorzec |
| `docs/AppForge/APP-CONFIG.md` | appId, enabledModules — jak mapować do workspace_modules |

**Kluczowe constraints:**
- `workspace_modules` RLS: tylko owner workspace może INSERT/UPDATE, wszyscy workspace members mogą SELECT
- Middleware działa PRZED route handlerem — wyłączony moduł nie dotrze do logiki domenowej
- Path → moduleId mapping: `/[slug]/calendar/*` → `'calendar'`, `/[slug]/employees/*` → `'employees'`
- Dla SimpliSalonCloud: seed workspace_modules z APP_CONFIG.enabledModules dla istniejących workspace'ów
- Middleware używa Supabase service role tylko dla odczytu workspace_modules — nie dla danych domenowych

## Zakres

### DB (codex-dad)

- [ ] Migracja: tabela `workspace_modules` (wg DB-SCHEMA.md)
- [ ] RLS: SELECT dla wszystkich members, INSERT/UPDATE/DELETE dla owner
- [ ] Seed migration: INSERT INTO workspace_modules dla każdego istniejącego workspace z modułami z APP_CONFIG

### Middleware + helpers (codex-main)

- [ ] `lib/modules/middleware-helpers.ts` — resolveModuleFromPath(), isModuleEnabledForWorkspace()
- [ ] Update `middleware.ts` — dodaj module gating do istniejącego middleware (nie zastępuj, rozszerz)

### API admin (codex-main)

- [ ] `app/api/admin/workspace-modules/route.ts` — GET (lista aktywnych modułów) + PATCH (enable/disable)
  Wymaga: owner role, workspace_id z auth context

## Work packages

- ID: pkg-db | Type: migration | Worker: codex-dad
  Outputs: supabase/migrations/[ts]_workspace_modules.sql + seed migration

- ID: pkg-middleware | Type: implementation | Worker: codex-main
  Inputs: pkg-db (gen types po migracji), AF-01 (lib/modules/types.ts)
  Outputs: lib/modules/middleware-helpers.ts + middleware.ts update

- ID: pkg-admin-api | Type: implementation | Worker: codex-main
  Inputs: pkg-db, pkg-middleware
  Outputs: app/api/admin/workspace-modules/route.ts

Kolejność: pkg-db najpierw → supabase db push → gen types → pkg-middleware + pkg-admin-api równolegle.

## Prompt — codex-dad (SQL migration)

```bash
DAD_PROMPT="Read .workflow/skills/sql-migration-safe.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/DB-SCHEMA.md for workspace_modules table schema and RLS pattern.

Goal: Create workspace_modules migration for SimpliSalonCloud.

File: /mnt/d/SimpliSalonCLoud/supabase/migrations/[TIMESTAMP]_workspace_modules.sql
Use timestamp: 20260501000001

SQL requirements:
1. CREATE TABLE workspace_modules:
   - workspace_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE (use 'salons' not 'workspaces' — existing table)
   - module_id text NOT NULL
   - enabled boolean DEFAULT true
   - config jsonb DEFAULT '{}'
   - enabled_at timestamptz DEFAULT now()
   - PRIMARY KEY (workspace_id, module_id)

2. RLS:
   - Enable RLS
   - SELECT policy: salon_id = get_user_salon_id() (use existing function)
   - INSERT/UPDATE/DELETE policy: salon_id = get_user_salon_id() AND has_any_salon_role(ARRAY['owner'])

3. Seed: INSERT INTO workspace_modules (workspace_id, module_id, enabled)
   SELECT id, module_id, true FROM salons
   CROSS JOIN (VALUES ('calendar'),('employees'),('crm'),('forms'),('surveys'),('notifications'),('billing'),('integrations')) AS modules(module_id)
   ON CONFLICT DO NOTHING;

Pure SQL only. No explanations." bash ~/.claude/scripts/dad-exec.sh
```

## Prompt — codex-main (middleware helpers + middleware update)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read middleware.ts for existing middleware logic. Read docs/AppForge/SECURITY.md for module gating pattern. Do NOT use Gemini — write directly.

Goal: Add module gating to existing middleware.

File 1: lib/modules/middleware-helpers.ts (NEW)
- Export: PATH_TO_MODULE map — Record<string, string> mapping URL prefixes to module IDs
  Examples: 'calendar' → 'calendar', 'employees' → 'employees', 'absences' → 'absence', etc.
- Export: resolveModuleFromPath(pathname: string): string | null
  Extracts module slug after /[slug]/ and maps to module ID using PATH_TO_MODULE
- Export: isModuleEnabledForWorkspace(workspaceId: string, moduleId: string): Promise<boolean>
  Queries workspace_modules table using Supabase service role client (createClient with service role)
  Returns true if row exists AND enabled = true

File 2: middleware.ts (EDIT — extend existing, do not replace)
- After existing auth check, add module gating block:
  1. Get moduleId from resolveModuleFromPath(pathname)
  2. If no moduleId found → NextResponse.next() (not a module route)
  3. Get workspaceId from slug in URL params
  4. Call isModuleEnabledForWorkspace(workspaceId, moduleId)
  5. If not enabled → NextResponse.redirect(new URL('/[slug]/dashboard', request.url))
- Module gating runs ONLY for /[slug]/* routes (dashboard routes)
- Do NOT gate /api/* routes (that is handled by getAuthContext in route handlers)

Constraints:
- workspace_modules uses salon_id column (legacy naming) not workspace_id
- isModuleEnabledForWorkspace must use createAdminSupabaseClient() to bypass RLS for middleware check
- All existing middleware logic must remain intact
Done when: tsc passes + middleware correctly intercepts /[slug]/calendar when calendar disabled."
```

## Prompt — codex-main (admin API)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/safe-sensitive-change.md and follow it.
Read lib/supabase/get-auth-context.ts for auth pattern. Read docs/AppForge/SECURITY.md for workspace isolation. Do NOT use Gemini — write directly.

Goal: Admin API for managing enabled modules per workspace.
File: app/api/admin/workspace-modules/route.ts

GET handler:
- getAuthContext() — requires owner role (return 403 if not owner)
- SELECT * FROM workspace_modules WHERE workspace_id = workspaceId
- Return: { modules: Array<{ moduleId, enabled, config }> }

PATCH handler:
- getAuthContext() — requires owner role
- Body: { moduleId: string, enabled: boolean, config?: Record<string, unknown> }
- Validate moduleId is a known module (check against hardcoded list from APP_CONFIG or MODULE_REGISTRY)
- UPSERT into workspace_modules
- Return 200 with updated row

Constraints:
- workspace_id always from getAuthContext() — never from body
- Owner-only — return 403 for manager/employee
- Validate moduleId against known list to prevent arbitrary module names
Done when: tsc passes."
```

## Po wykonaniu

```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
# Test: wyłącz moduł 'crm' w workspace_modules → /[slug]/crm → redirect do dashboard
# Test: owner może PATCH workspace-modules, manager dostaje 403
```

## Acceptance criteria

- [ ] Tabela `workspace_modules` istnieje z RLS
- [ ] Seed: wszystkie istniejące workspace'y mają moduły z APP_CONFIG.enabledModules
- [ ] Middleware: wyłączony moduł → redirect, nie route handler
- [ ] `GET/PATCH /api/admin/workspace-modules` działa, owner-only
- [ ] `npx tsc --noEmit` → clean
