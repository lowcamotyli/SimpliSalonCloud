# Sprint A — Bezpieczeństwo (KRYTYCZNE)

**Szacowany czas:** ~2h
**Priorytet:** Natychmiastowy — przed kolejnym deployem
**Status:** [ ] Do zrobienia

---

## A1 — `/api/integrations` — brak uwierzytelnienia

**Plik:** `app/api/integrations/route.ts`
**Ryzyko:** Dowolny nieuwierzytelniony użytkownik może odpytać konfigurację integracji (Booksy, Gmail) dowolnego salonu znając jego UUID z URL.

**Diagnoza:**
```
GET /api/integrations?salonId=<dowolny-uuid>
→ zwraca integration_configs + booksy_gmail_email bez sprawdzenia sesji
```

**Wymagane zmiany:**
1. Dodać `supabase.auth.getUser()` na początku handlera
2. Jeśli `!user` → zwrócić 401
3. Pobrać `salon_id` z profilu zalogowanego usera (zamiast z query params)
4. Zwrócić wyniki tylko dla własnego salonu

**Wzorzec do zastosowania** (jak w `app/api/bookings/route.ts`):
```typescript
const supabase = await createServerSupabaseClient()
const { data: { user }, error: authError } = await supabase.auth.getUser()
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
const { data: profile } = await supabase
  .from('profiles')
  .select('salon_id')
  .eq('user_id', user.id)
  .single()
// użyj profile.salon_id zamiast searchParams.get('salonId')
```

**Test weryfikacyjny:**
```bash
curl -s "http://localhost:3000/api/integrations?salonId=<jakikolwiek-uuid>"
# Oczekiwane: 401 Unauthorized
```

---

## A2 — `proxy.ts` — błędne uprawnienie blokuje managerów

**Plik:** `proxy.ts` linia 101
**Ryzyko:** Managerowie nie mogą wejść do żadnego ustawienia. Uprawnienie `settings:manage` nie istnieje w RBAC — żadna rola go nie ma (RBAC ma tylko `settings:view`).

**Diagnoza:**
```
proxy.ts:101  { regex: /\/settings\//, permission: 'settings:manage' }

lib/rbac/role-maps.ts — manager permissions:
  ['calendar:view', 'calendar:manage_all', 'clients:view', ..., 'settings:view']
  // brak 'settings:manage' !

Efekt:
  - Owner (ma '*') → OK
  - Manager (ma 'settings:view', nie 'settings:manage') → REDIRECT do /dashboard
  - Employee → REDIRECT (słusznie)
```

**Wymagana zmiana:** 1 linia w `proxy.ts`

```typescript
// PRZED:
{ regex: /\/settings\//, permission: 'settings:manage' },

// PO:
{ regex: /\/settings\//, permission: 'settings:view' },
```

**Uwaga:** Podstrony owner-only (`/settings/business`, `/settings/integrations`, `/settings/sms`) są chronione osobnymi layoutami server-side — middleware nie musi tego duplikować dla settings.

**Test weryfikacyjny:**
- Zaloguj się jako manager → wejdź w `/[slug]/settings` → powinno działać
- Wejdź w `/[slug]/settings/business` → powinien być 403/redirect (przez layout)

---

## A3 — `get_top_employees` — nieistniejąca funkcja DB

**Plik:** `app/api/reports/top-employees/route.ts` linia 34
**Ryzyko:** Błąd TS blokuje type-safe build. Wywołanie `supabase.rpc('get_top_employees')` zwróci 500 w runtime bo funkcja nie istnieje w żadnej migracji.

**Diagnoza:**
```
npx tsc --noEmit
→ error TS2345: Argument of type '"get_top_employees"' is not assignable to parameter of type ...

grep -r "get_top_employees" supabase/migrations/
→ brak wyników (funkcja nigdy nie została stworzona)
```

**Opcja 1 (zalecana) — usunąć RPC call, zostawić fallback:**

Kod już ma logikę fallback (linie 47–92) która działa poprawnie. Wystarczy usunąć blok `supabase.rpc(...)` i zawsze używać fallback query.

```typescript
// Usunąć cały blok:
const { data, error } = await supabase.rpc('get_top_employees', { ... })
if (error) { console.error(...) }
if (!data || error) { ... fallback ... }

// Zastąpić samym fallback query (zawsze):
const { data: bData, error: bError } = await supabase
  .from('bookings')
  .select(`id, total_price, base_price, surcharge, employee_id,
           employees(first_name, last_name, commission_rate)`)
  ...
```

**Opcja 2 — dodać migrację SQL z funkcją** (jeśli chcemy optymalizacji):
- Stworzyć `supabase/migrations/YYYYMMDDHHMMSS_add_get_top_employees.sql`
- Zdefiniować funkcję `get_top_employees(p_salon_id, p_starts_at_from, p_starts_at_to)`
- Uruchomić `supabase db push` + `npm run types:generate`

**Opcja 2 jest kompleksowsza — rekomendujemy Opcję 1 na teraz.**

**Dodatkowe poprawki w tym pliku:**
- Zamień `console.error(...)` → `logger.error(...)` z `@/lib/logger`
- Dodaj import `withErrorHandling` z `@/lib/error-handler`
- Dodaj auth check dla `profile.salon_id` (teraz pobiera salon przez RPC `get_user_salon_id` — ok, ale brak walidacji)

**Test weryfikacyjny:**
```bash
npx tsc --noEmit
# Oczekiwane: 0 errors
```

---

## Checklist Sprint A

- [ ] A1: Dodaj auth do `/api/integrations`
- [ ] A2: Zmień `settings:manage` → `settings:view` w `proxy.ts:101`
- [ ] A3: Usuń nieistniejące RPC call z `top-employees/route.ts`
- [ ] A3: Uruchom `npx tsc --noEmit` → 0 errors
- [ ] A1+A3: Manualny test w przeglądarce
