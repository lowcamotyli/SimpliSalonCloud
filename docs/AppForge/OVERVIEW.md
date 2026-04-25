# AppForge Platform — Architecture Overview

## Warstwy systemu

```
┌─────────────────────────────────────────────────────────┐
│  APPLICATION LAYER                                       │
│  app-config.ts: { modules[], theme, businessProfile }    │
├─────────────────────────────────────────────────────────┤
│  THEME LAYER                                             │
│  ComponentRegistry (React Context) + CSS Design Tokens   │
├─────────────────────────────────────────────────────────┤
│  MODULE LAYER                                            │
│  manifest.ts | public-api.ts | events | migrations | UI  │
├─────────────────────────────────────────────────────────┤
│  CORE LAYER                                              │
│  Auth | Workspaces | RBAC | Billing | EventBus | Audit   │
├─────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE                                          │
│  Supabase | Next.js 14 App Router | TypeScript strict    │
└─────────────────────────────────────────────────────────┘
```

## Moduły i kategorie

| ID | Nazwa | Kategoria | Wymaga |
|----|-------|-----------|--------|
| `calendar` | Kalendarz | scheduling | — |
| `employees` | Pracownicy (HCM) | hr | — |
| `absence` | Nieobecności | hr | employees |
| `time-tracking` | Ewidencja czasu | hr | employees |
| `payroll` | Payroll | hr | employees, time-tracking |
| `crm` | CRM | sales | — |
| `forms` | Formularze | operations | — |
| `surveys` | Ankiety | operations | — |
| `notifications` | Powiadomienia | operations | — |
| `billing` | Billing | core | — |
| `integrations` | Integracje | integrations | — |

## Struktura katalogów (kluczowa)

```
modules/
  [module-name]/
    manifest.ts          ← definicja modułu
    public-api.ts        ← API dla innych modułów
    components/          ← UI (używane przez app/)
    lib/                 ← business logic (używane przez app/api/)
      db/                ← Supabase queries
    db/migrations/       ← SQL per moduł
    config/
      schema.ts          ← Zod schema konfiguracji
      defaults.ts

lib/
  modules/               ← types, registry, slots
  events/                ← catalog, bus
  themes/                ← provider, registry interface
  config/                ← AppConfig types
  supabase/
    get-auth-context.ts  ← JEDYNY legalny dostęp do workspace_id

themes/
  _default/              ← shadcn/ui wrapped (fallback)
  [app-name]/            ← dostarczone komponenty per aplikacja

app-config.ts            ← generowany przez wizard, per deployment
```

## Zasady bezwzględne

1. Każde zapytanie DB filtruje po `workspace_id` — brak wyjątków
2. `workspace_id` pochodzi WYŁĄCZNIE z `getAuthContext()` — nigdy z body/params
3. Moduły komuniku się przez `PublicAPI` lub `EventBus` — nigdy przez bezpośredni import
4. Komponenty UI używają `useComponents()` — nigdy bezpośrednio `@/components/ui/*`
5. RLS na każdej tabeli modułu — bez wyjątku
6. Moduł wyłączony → middleware zwraca 404 przed route handlerem

## Profil biznesowy → rekomendowane moduły

| Profil | Moduły domyślne |
|--------|----------------|
| `beauty_salon` | calendar, employees, crm, notifications, forms, surveys |
| `gym` | calendar, employees, absence, time-tracking, crm |
| `medical` | calendar, employees, forms, notifications |
| `agency` | employees, absence, time-tracking, payroll, crm |
