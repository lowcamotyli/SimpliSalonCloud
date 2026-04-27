# AppForge — Module System

## ModuleManifest — pełny interfejs

```typescript
// lib/modules/types.ts

export type ModuleCategory = 'scheduling' | 'hr' | 'sales' | 'operations' | 'integrations'
export type BusinessProfile = 'beauty_salon' | 'gym' | 'medical' | 'workshop' | 'agency' | 'custom'

export interface ModuleManifest {
  id: string              // 'calendar' — kebab-case, globalnie unikalny
  name: string            // 'Kalendarz'
  description: string
  version: string         // semver
  icon: string            // Lucide icon name
  category: ModuleCategory

  // Graf zależności
  requires: string[]      // module IDs — muszą być aktywne
  enhances: string[]      // opcjonalne, ale lepiej razem
  conflicts: string[]     // wzajemnie wykluczające się

  // Dopasowanie do profilu
  recommendedFor: BusinessProfile[]

  // Konfiguracja
  configSchema: ZodSchema
  defaultConfig: unknown

  // Wkład do nawigacji
  navItems: NavItem[]

  // RBAC
  permissions: PermissionDefinition[]
  defaultRolePermissions: Record<'owner' | 'manager' | 'employee', Permission[]>

  // Extension slots (oferowane innym modułom)
  slots: Record<string, SlotDefinition>

  // Co ten moduł wstrzykuje w sloty innych modułów
  fills: Record<string, React.ComponentType>
  // format klucza: '{module_id}:{slot_id}' → 'employees:detail-tab'

  // Events
  emits: string[]         // event type strings publikowane przez ten moduł
  handles: string[]       // event type strings, na które się subskrybuje

  // DB
  migrations: string[]    // ścieżki SQL, ordered
  seedScript?: string

  // Lifecycle
  lifecycle: ModuleLifecycle
}

export interface ModuleLifecycle {
  onInstall(workspaceId: string): Promise<void>
  onUninstall(workspaceId: string, strategy: 'soft' | 'hard'): Promise<void>
  onUpgrade(workspaceId: string, fromVersion: string): Promise<void>
  healthCheck(workspaceId: string): Promise<{
    status: 'healthy' | 'degraded' | 'error'
    checks: Record<string, boolean>
  }>
}
```

## Struktura katalogu modułu

```
modules/[module-name]/
  manifest.ts          ← SINGLE SOURCE OF TRUTH
  public-api.ts        ← interfejs i implementacja dla innych modułów
  components/          ← React components (używane przez app/(dashboard)/)
  lib/
    db/                ← Supabase queries (tylko dla tego modułu)
    validation.ts      ← Zod schemas dla request/response
    utils.ts
  db/
    migrations/        ← .sql pliki, numerowane: 001_init.sql, 002_...sql
    seed.sql           ← opcjonalne demo data
  config/
    schema.ts          ← Zod schema konfiguracji z wizarda
    defaults.ts        ← domyślne wartości
  hooks/               ← React hooks (używane przez components/)
```

## Module Registry — wzorzec

```typescript
// lib/modules/registry.ts
import { calendarModule } from '@/modules/calendar/manifest'
import { employeesModule } from '@/modules/employees/manifest'
import { absenceModule } from '@/modules/absence/manifest'
// ...

export const MODULE_REGISTRY: ModuleManifest[] = [
  calendarModule,
  employeesModule,
  absenceModule,
  // kolejność = kolejność w nawigacji
]

export function getEnabledModules(enabledIds: string[]): ModuleManifest[] {
  return MODULE_REGISTRY.filter(m => enabledIds.includes(m.id))
}

export function resolveWithDependencies(moduleIds: string[]): string[] {
  // Rekurencyjnie dodaje requires[] do listy
}
```

## Dynamiczna nawigacja z manifests

```typescript
// app/(dashboard)/[slug]/layout.tsx
import { APP_CONFIG } from '@/app-config'
import { getEnabledModules } from '@/lib/modules/registry'

const modules = getEnabledModules(APP_CONFIG.enabledModules)
const navItems = modules.flatMap(m => m.navItems)
// sidebar generowany dynamicznie — brak hardcoded listy linków
```

## Extension Slots — UI injection

```tsx
// lib/modules/slots.ts
export function ModuleSlot({ moduleId, slotId, props }) {
  const Filler = useModuleRegistry().getSlotFiller(`${moduleId}:${slotId}`)
  if (!Filler) return null
  return <Filler {...props} />
}

// Użycie w modules/employees/components/EmployeeDetail.tsx:
// Employees NIE wie o Absence — ale Absence może dodać swoją zakładkę
<ModuleSlot moduleId="employees" slotId="detail-tab" props={{ employeeId }} />

// modules/absence/manifest.ts deklaruje:
// fills: { 'employees:detail-tab': AbsenceTab }
```

## Mapa zależności modułów

```
_core ←── (required by all)

calendar
  enhances: employees (availability), crm (history)

employees
  slots: detail-tab, list-column

absence
  requires: employees
  fills: employees:detail-tab

time-tracking
  requires: employees
  fills: employees:detail-tab

payroll
  requires: employees + time-tracking
  fills: employees:detail-tab

crm
  enhances: calendar
```

## Checklist nowego modułu

```
[ ] modules/[id]/manifest.ts — id, requires, navItems, permissions, migrations
[ ] modules/[id]/public-api.ts — interfejs + implementacja
[ ] modules/[id]/db/migrations/001_init.sql — tabele z prefixem
[ ] modules/[id]/config/schema.ts — Zod schema dla wizard
[ ] Dodaj do MODULE_REGISTRY w lib/modules/registry.ts
[ ] Dodaj do workspace_modules dla istniejących workspace (migration)
[ ] RLS na każdej tabeli (patrz SECURITY.md)
```
