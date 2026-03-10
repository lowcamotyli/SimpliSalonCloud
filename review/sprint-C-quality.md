# Sprint C — Jakość kodu (ŚREDNIE)

**Szacowany czas:** ~6h
**Priorytet:** Następny sprint (po A i B)
**Status:** [ ] Do zrobienia
**Zależność:** Sprint A i B muszą być zakończone

---

## C1 — Regeneracja typów Supabase → redukcja `as any`

**Skala problemu:** 246 wystąpień `as any` w `app/api/` — większość wynika z niezregenerowanych typów po nowych migracjach (ostatnie migracje: `services_survey_config`, `medical_forms`, `sms_chat_reminders`, `blacklist_crm`, `surveys_reports`).

**Krok 1 — regeneracja typów:**
```bash
npm run types:generate
# lub:
npx supabase gen types typescript --project-id ubkueiwelarplnbhqmoa --schema public > types/supabase.ts
```

**Krok 2 — weryfikacja nowych typów:**
```bash
npx tsc --noEmit
# Nowe błędy = miejsca gdzie as any maskowało problemy
```

**Krok 3 — systematyczne usuwanie `as any`:**

Priorytet plików (najwyższy wpływ):

| Plik | Użycia `as any` | Uwaga |
|------|-----------------|-------|
| `app/api/bookings/route.ts` | ~12 | Główna logika bookingów |
| `app/api/services/[id]/route.ts` | ~4 | Trigger version |
| `app/api/cron/surveys/route.ts` | ~2 | Admin client cast |
| `lib/messaging/email-sender.ts` | ~3 | salon_settings query |

**Wzorzec zamiany** (po regeneracji typów):
```typescript
// PRZED:
const { data } = await (supabase as any).from('satisfaction_surveys').insert({...})

// PO (po regeneracji):
const { data } = await supabase.from('satisfaction_surveys').insert({...})
// TypeScript zna teraz tabelę i jej kolumny
```

**Cel:** Zredukować z 246 do <50 (reszta to uzasadnione przypadki edge-case).

---

## C2 — Podział `import/page.tsx` (1011 linii)

**Plik:** `app/(dashboard)/[slug]/settings/import/page.tsx`
**Problem:** Jeden plik zawiera całą logikę importu CSV — parsowanie, walidację, preview, mapowanie pól, wysyłanie. Jest też błędnie umieszczona tablica `BUILTIN_TEMPLATES` (szablony formularzy — logika należy do `/settings/forms`).

**Proponowana struktura:**
```
app/(dashboard)/[slug]/settings/import/
  page.tsx                    — orchestrator (~80 linii)

components/settings/import/
  ImportDropzone.tsx           — upload + parsowanie CSV (~100 linii)
  ImportFieldMapper.tsx        — mapowanie kolumn CSV → pola DB (~150 linii)
  ImportPreviewTable.tsx       — podgląd wierszy z flagami błędów (~120 linii)
  ImportProgressStepper.tsx    — nawigacja między krokami (~60 linii)
  use-import-state.ts          — stan importu jako custom hook (~80 linii)
```

**Co usunąć z import/page.tsx:**
- `BUILTIN_TEMPLATES` — przenieść do `lib/forms/builtin-templates.ts` lub `components/forms/`
- Inline walidację CSV → osobna funkcja `lib/import/csv-validator.ts`

---

## C3 — Podział `forms/page.tsx` (719 linii)

**Plik:** `app/(dashboard)/[slug]/settings/forms/page.tsx`
**Problem:** Strona zawiera zarówno listę formularzy, jak i pełny edytor formularza i dialog przypisywania do usług — wszystko w jednym pliku 'use client'.

**Proponowana struktura:**
```
components/settings/forms/
  FormsTable.tsx               — lista formularzy z akcjami (~120 linii)
  FormEditorDialog.tsx         — dialog tworzenia/edycji formularza (~200 linii)
  FormFieldBuilder.tsx         — budowanie pól formularza drag-and-drop (~150 linii)
  FormServiceAssignDialog.tsx  — przypisanie do usług (już istnieje osobno — OK)
```

**Uwaga:** `FormServiceAssignDialog` już jest wydzielony w `components/forms/form-service-assign-dialog.tsx` — dobry wzorzec do kontynuowania.

---

## C4 — Usunąć testowe endpointy z produkcji

**Pliki do usunięcia lub zabezpieczenia:**

### `app/api/crm/test-sms/route.ts`
Zawartość: tylko proxy do `app/api/settings/sms/test/route.ts`.
- Sprawdzić czy jest użyte w jakimkolwiek frontend komponencie:
  ```bash
  grep -rn "crm/test-sms" --include="*.ts" --include="*.tsx" .
  ```
- Jeśli nie ma użyć → usunąć plik
- Jeśli jest używane → zmienić frontend na `/api/settings/sms/test`

### `app/api/test-db-fundamentals/route.ts`
Endpoint testowy — sprawdzić czy jest potrzebny w production.
- Jeśli to dev tool: dodać guard `if (process.env.NODE_ENV !== 'development') return 404`
- Lub usunąć jeśli nie używane

### `app/api/test-errors/`
Podobnie jak powyżej — wyłączyć lub usunąć w production.

---

## C5 — Ujednolicenie wzorca auth w API routes

**Problem:** Kilka różnych wzorców uwierzytelniania w API routes — utrudnia review i maintenance.

**Wzorzec A** (bookings, clients — poprawny):
```typescript
const supabase = await createServerSupabaseClient()
const { data: { user }, error: authError } = await supabase.auth.getUser()
if (authError || !user) throw new UnauthorizedError()
const { data: profile } = await supabase.from('profiles').select('salon_id').eq('user_id', user.id).single()
```

**Wzorzec B** (top-employees, inne — niekompletny):
```typescript
const supabase = await createServerSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
// brak pobierania salon_id z profilu — używa RPC
```

**Wzorzec C** (integrations — brak auth):
```typescript
// brak getUser()
```

**Plan:**
1. Stworzyć helper `lib/supabase/get-auth-context.ts`:
```typescript
export async function getAuthContext() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new UnauthorizedError()
  const { data: profile } = await supabase
    .from('profiles').select('salon_id').eq('user_id', user.id).single()
  if (!profile) throw new NotFoundError('Profile')
  return { supabase, user, salonId: (profile as any).salon_id }
}
```

2. Zastąpić boilerplate w każdym route (po regeneracji typów `as any` zniknie):
```typescript
export const GET = withErrorHandling(async (request: NextRequest) => {
  const { supabase, user, salonId } = await getAuthContext()
  // ...
})
```

**Szacowany wpływ:** ~15 plików API routes, redukcja ~10-15 linii boilerplate per route.

---

## C6 — Dodać `service_id` do tabeli `satisfaction_surveys` (opcjonalne)

**Kontekst:** Migracja `surveys_reports.sql` tworzy tabelę `satisfaction_surveys` bez kolumny `service_id`, ale CRON `surveys/route.ts` linia 110 próbuje zapisać `service_id`:
```typescript
await admin.from('satisfaction_surveys').insert({
  ...
  service_id: booking.services?.id ?? null,  // ta kolumna może nie istnieć
})
```

**Weryfikacja:**
```bash
# Sprawdź schema tabeli w Supabase Dashboard lub:
grep -n "service_id" supabase/migrations/20260331_surveys_reports.sql
```

**Jeśli kolumna nie istnieje → dodać migrację:**
```sql
ALTER TABLE public.satisfaction_surveys
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surveys_service ON public.satisfaction_surveys(service_id);
```

Następnie: `supabase db push` + `npm run types:generate`.

---

## Checklist Sprint C

- [ ] C1: `npm run types:generate` — regeneracja typów Supabase
- [ ] C1: `npx tsc --noEmit` — identyfikacja błędów ukrytych przez `as any`
- [ ] C1: Systematyczne usuwanie `as any` w kluczowych plikach (bookings, services, surveys)
- [ ] C2: Podział `import/page.tsx` → subkomponenty
- [ ] C2: Przeniesienie `BUILTIN_TEMPLATES` do `lib/forms/`
- [ ] C3: Podział `forms/page.tsx` → subkomponenty
- [ ] C4: Usunąć/zabezpieczyć testowe endpointy (`crm/test-sms`, `test-db-fundamentals`, `test-errors`)
- [ ] C5: Stworzyć `lib/supabase/get-auth-context.ts`
- [ ] C5: Zastąpić auth boilerplate w API routes
- [ ] C6: Zweryfikować i dodać `service_id` do `satisfaction_surveys` jeśli brak
- [ ] Końcowe: `npx tsc --noEmit` → 0 errors
- [ ] Końcowe: `npm run build` → 0 warnings krytycznych
