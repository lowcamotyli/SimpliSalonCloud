# Task 06 - Write To Builtin Templates

## Objective
Zapisac wszystkie zatwierdzone artefakty JSON do `lib/forms/builtin-templates.ts`,
grupujac szablony wedlug kategorii i oznaczajac `sensitive_health` komentarzem.
To jest finalny krok importu - bez zapisu do DB, bez nowego UI.

## Why Builtin Templates (Not Direct DB)
- `form_templates` wymaga `salon_id` (NOT NULL) - brak globalnych szablonow w DB.
- `BUILTIN_TEMPLATES` w kodzie sa dostepne dla wszystkich salonow przez `/settings/import`.
- Dodanie szablonow do tablicy = automatycznie dostepne po deploymencie.
- Salony importuja do swojej DB przez istniejacy UI - RLS, `salon_id` itd. juz dziala.

## Prerequisites
- Task 05 zakonczony: wszystkie artefakty maja `approved: true` lub `rejected: true`
- Migracja `20260401000000_form_data_category.sql` zastosowana
- `types/forms.ts` zaktualizowany o `data_category` po regeneracji typow Supabase

## Read Only Context
- `generated/form-templates/*.json` (tylko `approved: true`)
- `lib/forms/builtin-templates.ts` (istniejace szablony - nie usuwac)
- `types/forms.ts`
- `lib/forms/import-types.ts`

## Output Files
- `lib/forms/builtin-templates.ts` (rozszerzony, istniejace wpisy bez zmian)
- `scripts/write-builtin-templates.ts` (skrypt generujacy)

## Scope
Skrypt `write-builtin-templates.ts`:
1. Odczytuje wszystkie `generated/form-templates/*.json` z `approved: true`
2. Sortuje: najpierw `general`, potem `health`, na koncu `sensitive_health`
3. Generuje wpisy TypeScript zgodne z rozszerzonym `BuiltinFormTemplate`
4. Szablony `sensitive_health` dostaja komentarz:
   ```typescript
   // SENSITIVE_HEALTH: Wymaga review prawno-produktowego przed aktywacja przez salon.
   // Salon musi ustawic klauzule informacyjna Art. 9 GDPR przed wlaczeniem.
   ```
5. Dopisuje na koniec istniejacego pliku (NIE nadpisuje istniejacych 5 szablonow)

## Structure Of Generated Entry
```typescript
{
  name: 'MEDYCYNA ESTETYCZNA: mezoterapia iglowa',
  description: 'Karta zabiegowa zaimportowana z biblioteki SimpliSalon.',
  data_category: 'sensitive_health',
  requires_signature: true,
  gdpr_consent_text: '...',
  fields: [ ... ],
},
```

## Acceptance Criteria
- Istniejace 5 szablonow w `BUILTIN_TEMPLATES` pozostaja bez zmian
- Kazdy nowy wpis ma `data_category`
- `npx tsc --noEmit` przechodzi bez bledow
- Szablony `sensitive_health` maja komentarz ostrzegawczy
- Brak duplikatow (sprawdz po `name`)

## Suggested Agent
- Codex (generuje skrypt + edytuje plik) lub Claude bezposrednio jesli < 50 linii zmian

## Resume Prompt
Read `lib/forms/builtin-templates.ts`, `lib/forms/import-types.ts`, and approved artifacts from `generated/form-templates/`.
Do NOT use Gemini - write directly.
Create `scripts/write-builtin-templates.ts` that reads approved JSON artifacts and appends entries to `BUILTIN_TEMPLATES` in `lib/forms/builtin-templates.ts`.
Group by data_category (general first, sensitive_health last with warning comment).
Do NOT modify existing 5 templates. Write directly.
