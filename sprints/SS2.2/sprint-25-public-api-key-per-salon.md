# Sprint SS2.2-25 — Public API: Per-Salon Key (Security Fix)

## Cel
Naprawić IDOR w public API: `salon_id` musi pochodzić z server-side lookup klucza,
nie z nagłówka kontrolowanego przez wywołującego.

**Aktualna luka:**
```
X-API-Key: [jeden globalny klucz]   → validateApiKey() pass/fail
X-Salon-Id: [cokolwiek wyśle caller] → getSalonId() używa tej wartości bez weryfikacji własności
```

**Po naprawie:**
```
X-API-Key: [klucz salonu]  → DB lookup → zwraca salon_id (server-controlled)
X-Salon-Id: [ignorowany]   → frontend nadal wysyła (zero breaking changes), serwer ignoruje
```

## Zasada nadrzędna — maksymalna kompatybilność

**Frontend widget (`output/karolina-kasztelan-salon`) NIE ZMIENIA SIĘ.**
Nadal wysyła `X-API-Key` + `X-Salon-Id`. Serwer akceptuje oba nagłówki, ale:
- `X-API-Key` → lookup w `salon_api_keys` → server zwraca `salon_id`
- `X-Salon-Id` → ignorowany (lub logowany dla debugowania), nie trafia do żadnego zapytania DB

**Zewnętrzne integracje** (jeśli istnieją) nie potrzebują zmian — wysyłają ten sam klucz.

**Env vars `PUBLIC_API_KEY` + `PUBLIC_SALON_ID`** nie są usuwane — zostają jako fallback
na czas migracji + seeding pierwszego klucza w DB.

---

## Architektura — dokumenty referencyjne

```bash
cat d:/SimpliSalonCLoud/docs/architecture/security-model.md \
  | gemini -p "TASK: List all constraints for API key storage and hashing — is there any existing pattern for hashed credentials in this project? FORMAT: Bulleted list. LIMIT: Max 15 lines." \
  --output-format text 2>/dev/null | grep -v "^Loaded"
```

```bash
cat d:/SimpliSalonCLoud/docs/architecture/multi-tenant-architecture.md \
  | gemini -p "TASK: Describe how public-facing API endpoints are supposed to isolate salon data. Are there any notes about multi-tenant public access? FORMAT: Bulleted list. LIMIT: Max 15 lines." \
  --output-format text 2>/dev/null | grep -v "^Loaded"
```

**Kluczowe constraints:**
- `salon_api_keys` to tabela techniczna — **brak RLS** (server używa admin client do lookup)
- Klucz przechowywany jako SHA-256 hash (nie plaintext) — plaintext tylko przy generowaniu
- Admin client do lookup (`createAdminSupabaseClient`) — tabela jest poza zasięgiem RLS użytkowników
- `getSalonId()` w `lib/utils/salon.ts` NIE jest modyfikowana — zostaje jako is (używana wewnętrznie do env fallback)
- `validateApiKey()` zostaje jako is — nowa funkcja `resolveApiKey()` jest addytywna
- CORS: `X-Salon-Id` zostaje w `Access-Control-Allow-Headers` (preflight nie może się złamać)

---

## Stan aktualny — dokładna mapa

### Wzorzec w 8 plikach (identyczny):
```typescript
// Krok 1 — auth (pass/fail)
const authError = validateApiKey(request)
if (authError) return setCorsHeaders(request, authError)

// Krok 2 — salon_id z nagłówka (PODATNE)
const salonId = getSalonId(request)  // lub bezpośrednio process.env.PUBLIC_SALON_ID
```

### Wyjątki od wzorca:
- `payments/initiate` i `payments/status`: czytają `process.env.PUBLIC_SALON_ID` bezpośrednio (nie `getSalonId()`) — też do naprawy w tym sprincie
- `bookings/route.ts` i `bookings/group/route.ts`: czytają `process.env.PUBLIC_SALON_ID` bezpośrednio z własnym error handlerem

### Pliki z lintingu grep (do weryfikacji przed dispatchem):
```
app/api/public/availability/route.ts          → getSalonId()
app/api/public/availability/dates/route.ts    → getSalonId()
app/api/public/bookings/route.ts              → process.env.PUBLIC_SALON_ID bezpośrednio
app/api/public/bookings/group/route.ts        → process.env.PUBLIC_SALON_ID bezpośrednio
app/api/public/employees/route.ts             → getSalonId()
app/api/public/payments/initiate/route.ts     → getSalonId() + process.env.PUBLIC_SALON_ID
app/api/public/payments/status/route.ts       → getSalonId() + process.env.PUBLIC_SALON_ID
app/api/public/services/route.ts              → getSalonId()
```

---

## Zakres tego sprintu

### A — SQL Migration: tabela `salon_api_keys`

Tabela lookup klucz→salon:

```sql
CREATE TABLE salon_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,       -- SHA-256 hex
  label TEXT,                          -- np. "Widget główny", "Integracja X"
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ             -- opcjonalnie aktualizowane przy każdym żądaniu
);

-- Indeks dla szybkiego lookup (hot path każdego żądania public API)
CREATE UNIQUE INDEX salon_api_keys_hash_idx ON salon_api_keys(key_hash) WHERE is_active = true;
```

**Brak RLS** — tabela techniczna, dostępna tylko przez admin client.

**Seeding z env vars** (w migracji lub skrypcie one-off):
```sql
-- Seed istniejącego klucza jeśli PUBLIC_API_KEY i PUBLIC_SALON_ID są ustawione
-- Wykonaj ręcznie po migracji:
-- INSERT INTO salon_api_keys (salon_id, key_hash, label)
-- VALUES ($PUBLIC_SALON_ID, encode(sha256($PUBLIC_API_KEY::bytea), 'hex'), 'Legacy env key');
```

### B — `lib/middleware/api-key-auth.ts` — nowa funkcja `resolveApiKey()`

**Istniejąca `validateApiKey()` NIE jest modyfikowana** — zachowanie dla innych potencjalnych użytkowników.

Dodaj nową funkcję eksportowaną:

```typescript
export type ResolvedApiAuth = {
  salonId: string
  keyId: string
}

export async function resolveApiKey(
  request: NextRequest
): Promise<ResolvedApiAuth | NextResponse>
```

Logika:
1. Odczytaj `X-API-Key` z nagłówka
2. Oblicz SHA-256 hash klucza
3. `SELECT id, salon_id FROM salon_api_keys WHERE key_hash = $hash AND is_active = true` (admin client)
4. Jeśli nie znaleziono:
   - **Fallback (compat):** sprawdź czy klucz pasuje do `process.env.PUBLIC_API_KEY` AND `process.env.PUBLIC_SALON_ID` jest ustawiony → zwróć `{ salonId: env, keyId: 'env-fallback' }`
   - Jeśli też nie pasuje → zwróć `NextResponse 401`
5. Opcjonalnie (async, fire-and-forget): `UPDATE salon_api_keys SET last_used_at = now() WHERE id = $keyId`
6. Zwróć `{ salonId, keyId }`

**Fallback jest krytyczny dla kompatybilności:** istniejące klucze z env działają bez seedowania DB.

### C — 8 route files — zamiana wzorca

**Stary wzorzec (2 linie):**
```typescript
const authError = validateApiKey(request)
if (authError) return setCorsHeaders(request, authError)
const salonId = getSalonId(request)  // lub process.env.PUBLIC_SALON_ID
```

**Nowy wzorzec (3 linie, identyczny układ):**
```typescript
const authResult = await resolveApiKey(request)
if (authResult instanceof NextResponse) return setCorsHeaders(request, authResult)
const { salonId } = authResult
```

Wszystkie dalsze użycia `salonId` w tych plikach pozostają **bez zmian**.

### D — `lib/middleware/cors.ts` — bez zmian (ważne!)

`X-Salon-Id` zostaje w `Access-Control-Allow-Headers`. Preflight (`OPTIONS`) nie może się złamać.

### E — `lib/utils/salon.ts` — bez zmian

`getSalonId()` zostaje bez modyfikacji. Może być używana w przyszłości do innych celów lub przez nowe endpointy.

---

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker | Uwagi |
|------|-------|--------|-------|
| `supabase/migrations/[ts]_salon_api_keys.sql` | CREATE | Gemini | Brak RLS, indeks na hash |
| `lib/middleware/api-key-auth.ts` | EDIT — dodaj `resolveApiKey()` | codex-dad | Nie zmieniaj `validateApiKey()` |
| `app/api/public/services/route.ts` | EDIT — nowy wzorzec | codex-main (batch) | |
| `app/api/public/employees/route.ts` | EDIT — nowy wzorzec | codex-main (batch) | |
| `app/api/public/availability/route.ts` | EDIT — nowy wzorzec | codex-main (batch) | |
| `app/api/public/availability/dates/route.ts` | EDIT — nowy wzorzec | codex-main (batch) | |
| `app/api/public/bookings/route.ts` | EDIT — nowy wzorzec | codex-dad (batch) | bezpośredni process.env → resolveApiKey |
| `app/api/public/bookings/group/route.ts` | EDIT — nowy wzorzec | codex-dad (batch) | bezpośredni process.env → resolveApiKey |
| `app/api/public/payments/initiate/route.ts` | EDIT — nowy wzorzec | codex-dad (batch) | |
| `app/api/public/payments/status/route.ts` | EDIT — nowy wzorzec | codex-dad (batch) | |

**Łącznie: 1 migracja + 1 modyfikacja lib + 8 route files.**

## Zależności
- **Wymaga:** nic — niezależny, można uruchomić w dowolnym momencie Fali 2
- **Blokuje:** nic — bezpieczeństwo, nie feature
- **Rekomendacja:** uruchomić PRZED sprint-13 lub równolegle z nim

---

## Dispatch — Plan równoległy

Dwa workery równolegle:

```
codex-dad → resolveApiKey() + bookings/group/bookings + payments (bg)
codex-main → services/employees/availability/availability-dates (bg)
         ↓ wait all
gemini → SQL migration (może iść równolegle)
         ↓
supabase db push + gen types
npx tsc --noEmit
```

---

## Prompt — Gemini (SQL migration)

```bash
gemini -p "Generate SQL migration for SimpliSalonCloud (Supabase/PostgreSQL).

Create table salon_api_keys:
- id UUID PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- key_hash TEXT NOT NULL UNIQUE  (SHA-256 hex of the raw API key)
- label TEXT  (human-readable label, nullable)
- is_active BOOLEAN NOT NULL DEFAULT true
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- last_used_at TIMESTAMPTZ  (nullable, updated on use)

Do NOT add RLS — this table is accessed only via admin client.

Add unique partial index: CREATE UNIQUE INDEX salon_api_keys_active_hash_idx ON salon_api_keys(key_hash) WHERE is_active = true;
Add index on salon_id: CREATE INDEX salon_api_keys_salon_idx ON salon_api_keys(salon_id);

Add comment: COMMENT ON TABLE salon_api_keys IS 'Per-salon API keys for public booking widget. Keyed by SHA-256 hash of raw key.';

Output pure SQL only." \
  --output-format text 2>/dev/null | grep -v "^Loaded" > "supabase/migrations/20260420000001_salon_api_keys.sql"
```

---

## Prompt — codex-dad (resolveApiKey + bookings + payments)

```bash
DAD_PROMPT='Read lib/middleware/api-key-auth.ts, app/api/public/bookings/route.ts, app/api/public/bookings/group/route.ts, app/api/public/payments/initiate/route.ts, app/api/public/payments/status/route.ts for context.

Goal: Two changes.

CHANGE 1 — lib/middleware/api-key-auth.ts:
Add new exported async function resolveApiKey(request: NextRequest): Promise<{ salonId: string, keyId: string } | NextResponse>.

Logic:
1. const rawKey = request.headers.get("X-API-Key")
2. If no key: return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
3. Compute SHA-256 hex hash of rawKey using Node.js crypto:
   import { createHash } from "crypto"
   const keyHash = createHash("sha256").update(rawKey).digest("hex")
4. Query salon_api_keys via createAdminSupabaseClient():
   SELECT id, salon_id FROM salon_api_keys WHERE key_hash = $keyHash AND is_active = true (single row)
5. If found: fire-and-forget UPDATE last_used_at = now() WHERE id = $row.id. Return { salonId: row.salon_id, keyId: row.id }
6. Fallback if not found in DB:
   const envKey = process.env.PUBLIC_API_KEY
   const envSalon = process.env.PUBLIC_SALON_ID
   if (envKey && envSalon && rawKey === envKey) return { salonId: envSalon, keyId: "env-fallback" }
7. If still not resolved: return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

Do NOT modify existing validateApiKey() function.

CHANGE 2 — 4 route files: bookings/route.ts, bookings/group/route.ts, payments/initiate/route.ts, payments/status/route.ts:
In each file, replace the auth+salonId resolution pattern with:
  const authResult = await resolveApiKey(request)
  if (authResult instanceof NextResponse) return setCorsHeaders(request, authResult)
  const { salonId } = authResult

Remove:
- validateApiKey(request) calls
- getSalonId(request) calls
- direct process.env.PUBLIC_SALON_ID reads used for salonId (keep any other env reads)
- any manual "if (!salonId) return error" blocks that are now covered

Keep all other logic unchanged. Import resolveApiKey from @/lib/middleware/api-key-auth.
Files: /mnt/d/SimpliSalonCLoud/lib/middleware/api-key-auth.ts, /mnt/d/SimpliSalonCLoud/app/api/public/bookings/route.ts, /mnt/d/SimpliSalonCLoud/app/api/public/bookings/group/route.ts, /mnt/d/SimpliSalonCLoud/app/api/public/payments/initiate/route.ts, /mnt/d/SimpliSalonCLoud/app/api/public/payments/status/route.ts
Done when: tsc clean' bash ~/.claude/scripts/dad-exec.sh
```

---

## Prompt — codex-main (services + employees + availability x2)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read lib/middleware/api-key-auth.ts (after dad adds resolveApiKey), app/api/public/services/route.ts for context. Do NOT use Gemini — write directly.

Goal: In 4 public API route files, replace the auth+salonId pattern.

In each of these files:
  app/api/public/services/route.ts
  app/api/public/employees/route.ts
  app/api/public/availability/route.ts
  app/api/public/availability/dates/route.ts

Replace:
  const authError = validateApiKey(request)
  if (authError) return setCorsHeaders(request, authError)
  const salonId = getSalonId(request)

With:
  const authResult = await resolveApiKey(request)
  if (authResult instanceof NextResponse) return setCorsHeaders(request, authResult)
  const { salonId } = authResult

Update imports: remove validateApiKey and getSalonId imports, add resolveApiKey from @/lib/middleware/api-key-auth.
Keep all other logic unchanged.
Done when: tsc clean'
```

---

## Po migracji — sekwencja wykonania

```bash
# 1. Migracja DB
supabase db push

# 2. Seed istniejącego klucza (WAŻNE — bez tego fallback env będzie jedyną ścieżką)
# Uruchom po uzupełnieniu wartości:
# node -e "
#   const { createHash } = require('crypto');
#   const key = process.env.PUBLIC_API_KEY;
#   const hash = createHash('sha256').update(key).digest('hex');
#   console.log('INSERT INTO salon_api_keys (salon_id, key_hash, label) VALUES (''<PUBLIC_SALON_ID>'', '''+hash+''', ''Legacy env key'');');
# "
# Wklej wynik do Supabase SQL Editor

# 3. Regeneruj typy
supabase gen types typescript --linked > types/supabase.ts

# 4. TypeScript check
npx tsc --noEmit
```

---

## Weryfikacja po sprincie

```bash
npx tsc --noEmit

# Test 1 — poprawny klucz z env (fallback):
# curl -H "X-API-Key: $PUBLIC_API_KEY" -H "X-Salon-Id: wrong-uuid" /api/public/services
# → powinno zwrócić serwisy dla PUBLIC_SALON_ID (nie dla wrong-uuid)

# Test 2 — zły klucz:
# curl -H "X-API-Key: bad-key" /api/public/services
# → 401

# Test 3 — brak nagłówka klucza:
# curl /api/public/services
# → 401

# Test 4 — frontend widget (nie zmienia się, nadal wysyła X-Salon-Id):
# powinien działać identycznie jak przed zmianą
```

---

## Panel zarządzania kluczami (opcjonalnie — SS2.3)

Nie jest częścią tego sprintu. W SS2.3 można dodać:
- `app/(dashboard)/[slug]/settings/integrations/api-keys/page.tsx`
- Generowanie nowych kluczy (tylko hash trafia do DB, raw key pokazany raz)
- Revoke / rotate

---

## Uwagi dla Bartosza

### Seeding — krytyczny krok ręczny
Po `supabase db push` musisz ręcznie zaseedować istniejący klucz do tabeli `salon_api_keys`.
Jeśli nie, system przejdzie na fallback env (działa) — ale po usunięciu env vars w przyszłości przestanie.

Skrypt seeding jest w sekcji "Po migracji" powyżej.

### X-Salon-Id header — co z nim?
Nadal jest akceptowany przez CORS, ale **serwer go ignoruje**. Możesz go usunąć z widgetu
w SS2.3 przy okazji innego deploymentu frontendu — nie jest wymagany.

### Nowe klucze dla nowych salonów
W SS2.3: panel generowania kluczy. Do tego czasu: INSERT ręczny przez Supabase Dashboard.
