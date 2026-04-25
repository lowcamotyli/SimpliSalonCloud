# AppForge — App Configuration

## AppConfig — interfejs

```typescript
// lib/config/types.ts
export interface AppConfig {
  appId: string                              // 'simplisalon' — slug deploymentu
  appName: string                            // 'SimpliSalon Cloud'
  appUrl: string                             // 'https://app.simplisalon.pl'
  businessProfile: BusinessProfile           // profil dla auto-config w wizardzie
  enabledModules: string[]                   // kolejność = kolejność w nawigacji
  moduleConfigs: Record<string, unknown>     // konfiguracja per moduł (z wizarda)
  themeId: string                            // klucz w lib/themes/registry.ts
  branding: {
    logoUrl: string
    faviconUrl: string
    primaryColor: string                     // fallback CSS var
  }
  locale: string                             // 'pl' | 'en'
  timezone: string                           // 'Europe/Warsaw'
  currency: string                           // 'PLN'
}
```

## app-config.ts — przykład (SimpliSalon)

```typescript
// app-config.ts (root projektu — generowany przez wizard, checkin do repo)
import { type AppConfig } from '@/lib/config/types'

export const APP_CONFIG: AppConfig = {
  appId: 'simplisalon',
  appName: 'SimpliSalon Cloud',
  appUrl: process.env.NEXT_PUBLIC_APP_URL!,
  businessProfile: 'beauty_salon',

  enabledModules: [
    'calendar',
    'employees',
    'absence',
    'crm',
    'notifications',
    'forms',
    'surveys',
    'billing',
    'integrations',
  ],

  moduleConfigs: {
    calendar: {
      bookingWindowDays: 60,
      cancellationWindowHours: 24,
      defaultDurationMinutes: 60,
      bufferMinutes: 0,
      equipmentEnabled: true,
      groupBookingEnabled: true,
      onlineBookingEnabled: true,
    },
    employees: {
      contractTypes: ['employment', 'b2b', 'civil_law'],
      documentCategories: ['id_card', 'cv', 'certificate', 'other'],
      departments: ['reception', 'stylist', 'nail_tech', 'management'],
    },
    absence: {
      types: [
        { code: 'annual_leave', name: 'Urlop wypoczynkowy', daysPerYear: 26 },
        { code: 'sick_leave', name: 'Zwolnienie lekarskie', daysPerYear: null },
      ],
      approvalRequired: true,
    },
    crm: {
      channels: ['sms', 'email'],
      automationsEnabled: true,
    },
  },

  themeId: 'simplisalon',
  branding: {
    logoUrl: '/logo.svg',
    faviconUrl: '/favicon.ico',
    primaryColor: '#f43f5e',
  },
  locale: 'pl',
  timezone: 'Europe/Warsaw',
  currency: 'PLN',
}
```

## Dostęp do konfiguracji

```typescript
// W server components / API routes:
import { APP_CONFIG } from '@/app-config'
const moduleConfig = APP_CONFIG.moduleConfigs.calendar

// W client components (przez context — nie importuj app-config bezpośrednio):
const { moduleConfig } = useAppConfig('calendar')
```

## Zod schema moduleConfigs (per moduł)

Każdy moduł definiuje Zod schema w `modules/[id]/config/schema.ts`.
Wizard waliduje konfigurację przed zapisem.
`defaultConfig` w `manifest.ts` definiuje wartości domyślne.

## Runtime vs Build-time

| Model | Opis | Kiedy |
|-------|------|-------|
| Build-time (`app-config.ts`) | Jeden deployment = jedna konfiguracja. Rebuild przy zmianie. | Osobne aplikacje (SimpliSalon, GymEase...) |
| Runtime (`workspace_modules` DB) | Różne moduły per tenant. Bez rebuild. | Multi-tenant SaaS z różnymi planami |

SimpliSalonCloud używa build-time. Dla runtime: czytaj z `workspace_modules` przez middleware.

## Środowiskowe zmienne (per deployment)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_ID=simplisalon
NEXT_PUBLIC_THEME_ID=simplisalon
NEXT_PUBLIC_APP_URL=https://app.simplisalon.pl
```
