# AppForge — Security Model

## Auth Context — jedyna legalna ścieżka

```typescript
// ZAWSZE używaj getAuthContext() w API routes
import { getAuthContext } from '@/lib/supabase/get-auth-context'

export async function POST(request: Request) {
  const { supabase, user, workspaceId, role, permissions } = await getAuthContext()
  // workspaceId pochodzi z JWT app_metadata — nigdy z request body
  // Throws: UnauthorizedError (401), NotFoundError (404)
}
```

**Nigdy:**
- `const workspaceId = body.workspaceId` — IDOR vulnerability
- `supabase.auth.getSession()` — ufa JWT bez weryfikacji
- Brak `getAuthContext()` w route handler

## JWT Structure

```json
{
  "sub": "user-uuid",
  "app_metadata": {
    "workspace_id": "workspace-uuid",
    "role": "owner | manager | employee",
    "permissions": ["calendar:view", "employees:manage", "..."]
  }
}
```

Synchronizowany przez trigger `sync_user_claims` przy INSERT/UPDATE na `profiles`.

## Permission Model — pełna lista

```typescript
type Permission =
  // Core
  | 'workspace:manage' | 'workspace:billing' | 'audit:view'
  // Calendar
  | 'calendar:view' | 'calendar:manage' | 'calendar:manage_own'
  // Employees
  | 'employees:view' | 'employees:manage'
  | 'employees:view_sensitive'    // demografia, kontrakty
  | 'employees:manage_sensitive'
  // Absence
  | 'absence:view' | 'absence:request' | 'absence:approve'
  // Time Tracking
  | 'time:view' | 'time:track' | 'time:approve'
  // Payroll
  | 'payroll:view' | 'payroll:manage'
  // CRM
  | 'crm:view' | 'crm:manage'
```

## Domyślna macierz ról

| Uprawnienie | owner | manager | employee |
|-------------|:-----:|:-------:|:--------:|
| workspace:manage | ✓ | — | — |
| workspace:billing | ✓ | — | — |
| calendar:manage | ✓ | ✓ | — |
| calendar:manage_own | ✓ | ✓ | ✓ |
| employees:view | ✓ | ✓ | — |
| employees:manage | ✓ | ✓ | — |
| employees:view_sensitive | ✓ | — | — |
| absence:request | ✓ | ✓ | ✓ |
| absence:approve | ✓ | ✓ | — |
| time:track | ✓ | ✓ | ✓ |
| time:approve | ✓ | ✓ | — |
| payroll:view | ✓ | ✓ | — |
| payroll:manage | ✓ | — | — |
| crm:manage | ✓ | ✓ | — |

## RLS — wzorzec na każdą tabelę modułu

```sql
-- 1. Włącz RLS
ALTER TABLE cal_bookings ENABLE ROW LEVEL SECURITY;

-- 2. Workspace isolation (OBOWIĄZKOWE)
CREATE POLICY "workspace_isolation" ON cal_bookings
  USING (workspace_id = get_user_workspace_id());

-- 3. Indeks (OBOWIĄZKOWE)
CREATE INDEX idx_cal_bookings_workspace ON cal_bookings(workspace_id);

-- 4. Wrażliwe dane (hr_demographics, hr_documents) — dodaj permission check
CREATE POLICY "sensitive_access" ON hr_demographics
  USING (
    workspace_id = get_user_workspace_id()
    AND has_permission('employees:view_sensitive')
  );
```

## SQL Helper Functions (Core — zawsze dostępne)

```sql
-- Wyciąga workspace_id z JWT claims
get_user_workspace_id() → uuid

-- Sprawdza permission w JWT claims
has_permission(permission text) → boolean

-- Sprawdza rolę (legacy — używaj has_permission gdy możesz)
has_any_salon_role(roles text[]) → boolean
```

## Module Gating — Middleware

```typescript
// middleware.ts
// Sprawdza czy moduł aktywny dla workspace PRZED route handlerem
// Wyłączony moduł → redirect do /dashboard (nigdy nie dotrze do handler)
```

Konfiguracja w `workspace_modules` (DB):
```sql
SELECT enabled FROM workspace_modules
WHERE workspace_id = $1 AND module_id = $2
```

## Checklist bezpieczeństwa per sprint

```
[ ] getAuthContext() na początku każdego handler
[ ] workspace_id pochodzi z getAuthContext — nie z body/params
[ ] RLS policy na każdej nowej tabeli
[ ] Indeks na workspace_id każdej nowej tabeli
[ ] Dane wrażliwe → osobna tabela + has_permission() w RLS
[ ] IDOR check: czy zapytanie filtruje workspace_id + record id razem?
```
