# Sprint AF-04 — Calendar Module Manifest + Public API

> **⚡ Dispatch równolegle z:** [AF-05](AF-05-employees-crm-manifests.md) · [AF-06](AF-06-absence-payroll-manifests.md)
> Wszystkie trzy sprinty to niezależne manifesty modułów — żaden nie zależy od drugiego.

## Cel
(P1) Wyodrębnienie modułu Calendar: manifest opisujący moduł, Public API
dla innych modułów oraz schema konfiguracji. Istniejący kod nie jest zmieniany —
tylko dodajemy warstwę opisu i abstrakcji.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/EVENTS.md. List: (1) full ModuleManifest interface, (2) events emitted by calendar module, (3) PublicAPI pattern for cross-module queries. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/MODULE-SYSTEM.md` | ModuleManifest interface, slot system, lifecycle |
| `docs/AppForge/EVENTS.md` | booking.* events emitted by calendar, PublicAPI pattern |
| `docs/AppForge/SECURITY.md` | permission names, default role matrix |

**Kluczowe constraints:**
- Calendar emits: `booking.created`, `booking.cancelled`, `booking.completed`
- Calendar enhances (optional deps): `employees` (availability), `crm` (booking history)
- Public API używa istniejących zapytań DB — NIE duplikuje logiki, NIE zmienia istniejących plików
- Manifest jest read-only metadata — nie zmienia żadnego istniejącego route'u ani komponentu
- Permissions z manifest.ts muszą być zgodne z istniejącym JWT (`calendar:view`, `calendar:manage`, `calendar:manage_own`)

## Zakres

### Pliki do stworzenia (wszystkie nowe — istniejący kod niezmieniony)

| Plik | Worker | Zawartość |
|------|--------|-----------|
| `modules/calendar/manifest.ts` | codex-main | Pełny ModuleManifest |
| `modules/calendar/public-api.ts` | codex-main | CalendarPublicAPI interface + implementacja |
| `modules/calendar/config/schema.ts` | codex-main | Zod schema konfiguracji |
| `modules/calendar/config/defaults.ts` | codex-main | Domyślne wartości |
| Dodaj do `lib/modules/registry.ts` | Claude | Import + dodaj calendarModule do MODULE_REGISTRY |

## Work packages

- ID: pkg-calendar-manifest | Type: implementation | Worker: codex-main
  Inputs: docs/AppForge/MODULE-SYSTEM.md, docs/AppForge/EVENTS.md, docs/AppForge/SECURITY.md
  Outputs: modules/calendar/ (4 pliki)

- ID: pkg-registry-update | Type: implementation | Worker: Claude (< 5 linii)
  Inputs: pkg-calendar-manifest
  Output: lib/modules/registry.ts update

## Prompt — codex-main (calendar manifest + public API)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read docs/AppForge/MODULE-SYSTEM.md for ModuleManifest interface.
Read docs/AppForge/EVENTS.md for calendar events and PublicAPI pattern.
Read lib/modules/types.ts for exact TypeScript types to use.
Do NOT use Gemini — write directly.

Goal: Create Calendar module manifest and public API.

File 1: modules/calendar/manifest.ts
- Import ModuleManifest from lib/modules/types
- Export calendarModule: ModuleManifest = {
    id: 'calendar',
    name: 'Kalendarz',
    description: 'Rezerwacje online i offline, harmonogram pracowników, zarządzanie sprzętem',
    version: '1.0.0',
    icon: 'CalendarDays',
    category: 'scheduling',
    requires: [],
    enhances: ['employees', 'crm'],
    conflicts: [],
    recommendedFor: ['beauty_salon', 'gym', 'medical', 'workshop'],
    navItems: [
      { path: 'calendar', label: 'Kalendarz', icon: 'CalendarDays', permission: 'calendar:view' },
      { path: 'bookings', label: 'Rezerwacje', icon: 'BookOpen', permission: 'calendar:view' },
    ],
    permissions: [
      { id: 'calendar:view', label: 'Podgląd kalendarza', description: 'Wyświetlanie kalendarza i rezerwacji' },
      { id: 'calendar:manage', label: 'Zarządzanie', description: 'Tworzenie i edycja rezerwacji dla wszystkich' },
      { id: 'calendar:manage_own', label: 'Własny kalendarz', description: 'Zarządzanie tylko własnymi rezerwacjami' },
    ],
    defaultRolePermissions: {
      owner: ['calendar:view', 'calendar:manage'],
      manager: ['calendar:view', 'calendar:manage'],
      employee: ['calendar:view', 'calendar:manage_own'],
    },
    slots: {
      'booking-detail-action': { id: 'booking-detail-action', description: 'Extra action in booking detail panel', props: { bookingId: 'string' } },
    },
    fills: {},
    emits: ['booking.created', 'booking.cancelled', 'booking.completed'],
    handles: ['employee.deactivated', 'absence.approved'],
    migrations: [],
    lifecycle: {
      onInstall: async (workspaceId) => {},
      onUninstall: async (workspaceId, strategy) => {},
      onUpgrade: async (workspaceId, fromVersion) => {},
      healthCheck: async (workspaceId) => ({ status: 'healthy', checks: {} }),
    },
  }

File 2: modules/calendar/public-api.ts
- Export interface CalendarPublicAPI:
  getBooking(id: string, workspaceId: string): Promise<Booking | null>
  listBookingsForEmployee(employeeId: string, from: Date, to: Date, workspaceId: string): Promise<Booking[]>
  isSlotAvailable(employeeId: string, from: Date, to: Date, workspaceId: string): Promise<boolean>
  cancelFutureBookingsForEmployee(employeeId: string, workspaceId: string, fromDate: Date): Promise<number>
- Import createAdminSupabaseClient from lib/supabase/admin
- Implement each method using existing bookings table (column: salon_id for workspace isolation)
- Export singleton: export const calendarAPI: CalendarPublicAPI = { ... }

File 3: modules/calendar/config/schema.ts
- Import z from 'zod'
- Export CalendarConfigSchema = z.object({
    bookingWindowDays: z.number().int().min(1).max(365).default(60),
    cancellationWindowHours: z.number().int().min(0).max(168).default(24),
    defaultDurationMinutes: z.number().int().min(15).max(480).default(60),
    bufferMinutes: z.number().int().min(0).max(60).default(0),
    equipmentEnabled: z.boolean().default(true),
    groupBookingEnabled: z.boolean().default(false),
    onlineBookingEnabled: z.boolean().default(true),
  })
- Export type CalendarConfig = z.infer<typeof CalendarConfigSchema>

File 4: modules/calendar/config/defaults.ts
- Export calendarDefaults: CalendarConfig (from CalendarConfigSchema defaults)

Constraints:
- DO NOT modify any existing file in app/, components/, or lib/
- public-api.ts uses 'salon_id' column (existing SimpliSalonCloud naming)
- All Supabase queries in public-api.ts filter by workspace_id param (mapped to salon_id)
Done when: tsc passes for all 4 files."
```

## Claude — registry update (< 5 linii)

```typescript
// lib/modules/registry.ts — dodaj:
import { calendarModule } from '@/modules/calendar/manifest'
// ...do MODULE_REGISTRY:
export const MODULE_REGISTRY: ModuleManifest[] = [
  calendarModule,
]
```

## Verification

```bash
npx tsc --noEmit
# Sprawdź: import { calendarModule } from '@/modules/calendar/manifest' działa
# Sprawdź: calendarAPI.isSlotAvailable() jest type-safe
# Sprawdź: MODULE_REGISTRY.find(m => m.id === 'calendar') zwraca manifest
```

## Acceptance criteria

- [ ] `modules/calendar/manifest.ts` — pełny ModuleManifest z navItems, permissions, events
- [ ] `modules/calendar/public-api.ts` — CalendarPublicAPI z implementacją (Supabase queries)
- [ ] `modules/calendar/config/schema.ts` — Zod schema + CalendarConfig type
- [ ] `modules/calendar/config/defaults.ts` — wartości domyślne
- [ ] `lib/modules/registry.ts` — calendarModule w MODULE_REGISTRY
- [ ] `npx tsc --noEmit` → clean
