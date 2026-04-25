# AppForge — Data Gathering Workbook (Wizard)

## Cel

Wizard (`/setup`) prowadzi przez tworzenie nowej aplikacji:
wybór modułów → konfiguracja → styl graficzny → generowanie `app-config.ts` + migracje.

## Flow (5 kroków)

### Krok 1: Profil biznesowy
```
Wybierz typ działalności:
  ○ Salon urody / Spa / Wellness     → modules: calendar, employees, crm, notifications, forms, surveys
  ○ Siłownia / Studio fitness        → modules: calendar, employees, absence, time-tracking, crm
  ○ Gabinet medyczny / Fizjoterapia  → modules: calendar, employees, forms, notifications
  ○ Warsztat / Serwis                → modules: calendar, employees, crm, forms
  ○ Biuro / Agencja HR               → modules: employees, absence, time-tracking, payroll, crm
  ○ Własny (custom)                  → brak pre-selection
```

### Krok 2: Moduły
```
Zawsze aktywne: _core (auth, workspace, billing)

Dostępne (checkboxy):
  [✓] Kalendarz          scheduling   — brak zależności
  [✓] Pracownicy (HCM)   hr           — brak zależności
  [✓] Nieobecności       hr           — wymaga: Pracownicy (auto-check)
  [ ] Ewidencja czasu    hr           — wymaga: Pracownicy
  [ ] Payroll            hr           — wymaga: Pracownicy + Ewidencja czasu
  [✓] CRM                sales        — brak zależności
  [✓] Formularze         operations   — brak zależności
  [ ] Ankiety            operations   — brak zależności
  [ ] Powiadomienia      operations   — brak zależności
  [ ] Integracje         integrations — brak zależności

Zależności: auto-check i grayout requires[]. Konflikty: warning badge.
```

### Krok 3: Konfiguracja modułów
```
Accordion — jeden panel per aktywny moduł.
Wartości z manifest.defaultConfig jako placeholder.

▼ Kalendarz
   Okno rezerwacji: [60] dni
   Anulowanie do: [24] h przed wizytą
   Bufor między wizytami: [0] min
   Rezerwacje grupowe: [✓]
   Sprzęt: [✓]

▼ Pracownicy (HCM)
   Typy kontraktu: [✓] Umowa o pracę  [✓] B2B  [✓] Zlecenie
   Kategorie dokumentów: [✓] Dowód  [✓] CV  [✓] Certyfikaty
   Działy: [reception] [stylist] [+Dodaj]

▼ Nieobecności
   [+ Urlop wypoczynkowy — 26 dni/rok]
   [+ Zwolnienie lekarskie — bez limitu]
   [+ Dodaj typ]
   Zatwierdzanie: [✓]

Walidacja: Zod schema z modules/[id]/config/schema.ts
```

### Krok 4: Styl graficzny
```
Wybierz theme:
  ○ Default (shadcn/ui)
  ○ SimpliSalon (rose/coral — salon)
  ○ GymEase (dark/electric — fitness)
  ○ MediPro (white/blue — medical)
  ○ Wgraj własny (ZIP z plikami TSX)

Branding:
  Nazwa: [________________]
  Logo: [Upload SVG/PNG]
  URL aplikacji: [https://app.____.pl]
  Kolor główny: [#f43f5e ■]
```

### Krok 5: Generowanie
```
Podsumowanie:
  Aktywne moduły: 6
  Nowe tabele DB: 23
  Theme: simplisalon

Opcje:
  [✓] Uruchom migracje (supabase db push)
  [✓] Wygeneruj types (supabase gen types)
  [✓] Dodaj dane demo
  [ ] Skonfiguruj domenę

[→ Utwórz aplikację]
```

## Output wizarda (3 artefakty)

### 1. `app-config.ts` (root projektu)
Pełna konfiguracja zgodna z `AppConfig` (patrz APP-CONFIG.md).

### 2. Migration manifest
```
supabase/migrations/[timestamp]_wizard_selected_modules.sql
-- Zawiera tylko tabele wybranych modułów (z modules/*/db/migrations/)
```

### 3. Seed script (opcjonalnie)
```
supabase/seed.sql
-- Dane demo z modules/*/db/seed.sql wybranych modułów
```

## Implementacja: kluczowe pliki

```
app/setup/
  page.tsx               ← WizardContainer (client component)
  _steps/
    BusinessProfile.tsx
    ModuleSelection.tsx
    ModuleConfiguration.tsx
    ThemeSelection.tsx
    GenerateApp.tsx
  _actions/
    generate-config.ts   ← Server action: zapisuje app-config.ts
    run-migrations.ts    ← Server action: supabase db push
  _lib/
    module-resolver.ts   ← resolveWithDependencies(), detectConflicts()
    config-generator.ts  ← buildAppConfig() → AppConfig
```

## Nowy projekt (fork workflow)

```bash
# 1. Fork template
gh repo create my-app --template flowsforge/platform

# 2. Skonfiguruj Supabase
supabase init && supabase link --project-ref [ref]

# 3. Uruchom wizard
pnpm dev → /setup

# 4. Deploy
vercel --prod
```
