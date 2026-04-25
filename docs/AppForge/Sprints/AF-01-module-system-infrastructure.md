# Sprint AF-01 — Module System Infrastructure

> **⚡ Dispatch równolegle z:** [AF-02](AF-02-theme-system-infrastructure.md)
> Oba są sprintami startowymi bez żadnych zależności — uruchom jednocześnie.

## Cel
(P0) Zbudowanie fundamentu platformy: typy TypeScript, Module Registry, Event Bus i AppConfig.
Żaden inny sprint AppForge nie może startować bez tych plików.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/EVENTS.md. List ALL interfaces, types and patterns that must be implemented in this sprint. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/MODULE-SYSTEM.md` | ModuleManifest, ModuleLifecycle, SlotDefinition, ModuleRegistry |
| `docs/AppForge/EVENTS.md` | EVENT_CATALOG (Zod schemas), EventBus, cross-module PublicAPI pattern |
| `docs/AppForge/APP-CONFIG.md` | AppConfig interface, app-config.ts example |
| `docs/AppForge/OVERVIEW.md` | Module list, categories, dependency rules |

**Kluczowe constraints:**
- Wszystkie interfejsy w `lib/modules/types.ts` — single source of truth dla TypeScript
- EVENT_CATALOG używa Zod do walidacji — każde zdarzenie ma runtime-validated schema
- `app-config.ts` w root projektu — generowany przez wizard, checkin do repo
- Brak circular imports: `lib/modules/` nie importuje z `modules/*/`

## Zakres

### Pliki do stworzenia (wszystkie nowe)

| Plik | Worker | Zawartość |
|------|--------|-----------|
| `lib/modules/types.ts` | codex-main | ModuleManifest, ModuleLifecycle, NavItem, SlotDefinition, PermissionDefinition |
| `lib/modules/registry.ts` | codex-main | MODULE_REGISTRY (pusty), getEnabledModules(), resolveWithDependencies() |
| `lib/modules/slots.ts` | codex-main | ModuleSlot React component |
| `lib/modules/public-apis.ts` | codex-main | MODULE_APIS registry (puste, placeholder) |
| `lib/events/catalog.ts` | codex-dad | EVENT_CATALOG z Zod schemas (wszystkie 15+ zdarzeń) |
| `lib/events/bus.ts` | codex-dad | EventBus class: on(), emit(), persistEvent() stub |
| `lib/config/types.ts` | Claude | AppConfig interface |
| `app-config.ts` | Claude | Instancja dla SimpliSalonCloud |

## Work packages

- ID: pkg-module-types | Type: implementation | Worker: codex-main
  Inputs: docs/AppForge/MODULE-SYSTEM.md
  Outputs: lib/modules/types.ts, lib/modules/registry.ts, lib/modules/slots.ts, lib/modules/public-apis.ts

- ID: pkg-events | Type: implementation | Worker: codex-dad
  Inputs: docs/AppForge/EVENTS.md
  Outputs: lib/events/catalog.ts, lib/events/bus.ts

- ID: pkg-config | Type: implementation | Worker: Claude
  Inputs: docs/AppForge/APP-CONFIG.md
  Outputs: lib/config/types.ts, app-config.ts

## Prompt — codex-main (module types + registry)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read docs/AppForge/MODULE-SYSTEM.md and docs/AppForge/OVERVIEW.md for context. Do NOT use Gemini — write directly.

Goal: Create the module system TypeScript foundation.

Files to create:

1. lib/modules/types.ts
   - Export: ModuleCategory type ('scheduling'|'hr'|'sales'|'operations'|'integrations')
   - Export: BusinessProfile type ('beauty_salon'|'gym'|'medical'|'workshop'|'agency'|'custom')
   - Export: NavItem interface { path, label, icon, permission?, children? }
   - Export: SlotDefinition interface { id, description, props }
   - Export: PermissionDefinition interface { id, label, description }
   - Export: ModuleLifecycle interface { onInstall, onUninstall, onUpgrade, healthCheck }
   - Export: ModuleManifest interface (full — see docs/AppForge/MODULE-SYSTEM.md)
   - Import Permission type from lib/rbac/permissions.ts (use string fallback if not found)
   - Import ZodSchema from zod

2. lib/modules/registry.ts
   - Import ModuleManifest from ./types
   - Export: MODULE_REGISTRY as ModuleManifest[] = [] (empty, will be filled per sprint)
   - Export: getEnabledModules(enabledIds: string[]): ModuleManifest[]
   - Export: resolveWithDependencies(moduleIds: string[]): string[] (recursive, handles requires[])
   - Export: detectConflicts(moduleIds: string[]): string[] (returns conflicting pairs as strings)

3. lib/modules/slots.ts
   - React client component ModuleSlot({ moduleId, slotId, props })
   - Uses a simple Map-based registry (ModuleSlotRegistry)
   - Export: registerSlotFiller(key: string, component: React.ComponentType): void
   - Export: ModuleSlot component (returns null if no filler registered)

4. lib/modules/public-apis.ts
   - Export: MODULE_APIS as Record<string, () => Promise<unknown>> = {}
   - Comment: 'Populated by module manifests — see modules/*/public-api.ts'

Constraints:
- TypeScript strict, explicit return types on all exports
- No circular imports with modules/* directories
- lib/modules/slots.ts must be a client component ('use client')
Done when: npx tsc --noEmit passes for all 4 files."
```

## Prompt — codex-dad (event catalog + bus)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/EVENTS.md for the full event catalog and EventBus pattern.

Goal: Create the event system — catalog with Zod validation and EventBus.

Files to create:

1. /mnt/d/SimpliSalonCLoud/lib/events/catalog.ts
   - Import z from 'zod'
   - Export EVENT_CATALOG const with ALL events from docs/AppForge/EVENTS.md (booking.*, employee.*, absence.*, time.*, payroll.*)
   - Each event value is a z.object({...}) schema
   - Export: type EventType = keyof typeof EVENT_CATALOG
   - Export: type EventPayload<T extends EventType> = z.infer<typeof EVENT_CATALOG[T]>
   - Mark as: as const satisfies Record<string, z.ZodSchema>

2. /mnt/d/SimpliSalonCLoud/lib/events/bus.ts
   - Import EventType, EventPayload from ./catalog
   - Class EventBus with private handlers Map
   - Method on<T extends EventType>(type: T, handler): void
   - Method emit<T extends EventType>(type: T, payload: EventPayload<T>): Promise<void>
     Uses Promise.allSettled so one handler error does not block others
   - Export singleton: export const eventBus = new EventBus()
   - Stub persistEvent (console.log for now — will be wired to audit_log later)

Constraints:
- Zod must be a dependency (check package.json — already installed in Next.js project)
- No React imports in these files (pure TS, server-safe)
- Explicit generic types on all EventBus methods
Done when: files created and tsc passes." bash ~/.claude/scripts/dad-exec.sh
```

## Claude pisze (< 10 linii każdy)

```typescript
// lib/config/types.ts — Claude writes directly
export type BusinessProfile = 'beauty_salon' | 'gym' | 'medical' | 'workshop' | 'agency' | 'custom'

export interface AppConfig {
  appId: string
  appName: string
  appUrl: string
  businessProfile: BusinessProfile
  enabledModules: string[]
  moduleConfigs: Record<string, unknown>
  themeId: string
  branding: { logoUrl: string; faviconUrl: string; primaryColor: string }
  locale: string
  timezone: string
  currency: string
}
```

```typescript
// app-config.ts — Claude writes directly (SimpliSalon initial config)
// See docs/AppForge/APP-CONFIG.md for full example
```

## Verification

```bash
npx tsc --noEmit
# Sprawdź: lib/modules/types.ts eksportuje ModuleManifest
# Sprawdź: lib/events/catalog.ts ma 15+ zdarzeń z Zod schemas
# Sprawdź: eventBus.emit('booking.created', { ... }) jest type-safe
```

## Acceptance criteria

- [ ] `lib/modules/types.ts` — ModuleManifest z pełnym interfejsem
- [ ] `lib/modules/registry.ts` — getEnabledModules() + resolveWithDependencies()
- [ ] `lib/modules/slots.ts` — ModuleSlot component (client)
- [ ] `lib/events/catalog.ts` — EVENT_CATALOG z Zod schemas dla booking.*, employee.*, absence.*, time.*, payroll.*
- [ ] `lib/events/bus.ts` — EventBus singleton z generycznymi metodami
- [ ] `lib/config/types.ts` — AppConfig interface
- [ ] `app-config.ts` — wypełniony dla SimpliSalonCloud
- [ ] `npx tsc --noEmit` → clean
