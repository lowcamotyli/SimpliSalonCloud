# Sprint L2-B — Treatment Records: UI + Widok klienta

- Status: **TODO** (po L2-A)
- Zależności: L2-A (tabela + API muszą istnieć, typy zregenerowane)
- Szacowany czas: 3 sesje Claude

---

## Cel

Zbudować pełen UI do tworzenia i przeglądania kart zabiegowych w dashboardzie. Zaszyfrować `notes_encrypted` w API (AES-256-GCM). Połączyć booking dialog z nowym formularzem.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/SS2.0/v2.0-definition.md` sekcja 3.2 (Treatment Records UI) | UI requirements, RBAC per role |
| `docs/architecture/security-model.md` | Szyfrowanie danych zdrowotnych, kto widzi co |
| `docs/architecture/data-architecture.md` | AES-256-GCM — encrypt przed INSERT, decrypt przy READ |
| `docs/architecture/bounded-contexts.md` | Treatment Records ↔ Client context — relacja |
| `docs/architecture/adr/002-domain-modules.md` | Strony UI traktuj jako "frontend" tego domain module — nie importuj logiką treatment-records do innych modułów bezpośrednio |
| `docs/architecture/adr/004-tenant-isolation.md` | Każde wywołanie API musi zwracać dane tylko dla `get_user_salon_id()` — sprawdź query w GET handler po Codex |
| `docs/architecture/service-architecture.md` | Thin route handlers: decrypt logic w `lib/treatment-records/crypto.ts`, nie inline w route; handler wywołuje service function |
| `docs/architecture/multi-tenant-architecture.md` | Strony `/clients/[id]/treatment-records` muszą weryfikować że `client.salon_id = authCtx.salonId` — bez tego employee może podmienić ID w URL |

---

## Pliki kontekstowe (czytać na początku sesji)

```
types/supabase.ts                                       ← sekcja treatment_records (view_range)
app/api/treatment-records/route.ts                      ← API z L2-A (sygnatury)
app/api/treatment-records/[id]/route.ts                 ← API z L2-A
lib/forms/encryption.ts                                 ← sygnatury encryptField, decryptField
lib/supabase/get-auth-context.ts                        ← getAuthContext() sygnatura
app/(dashboard)/[slug]/clients/[id]/page.tsx            ← view_range: 1-50 — wzorzec strony klienta
```

---

## Scope

### Sesja 1 — Szyfrowanie w API + Strona listy

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Encrypt notes_encrypted w POST | `app/api/treatment-records/route.ts` | Claude | Edit ~15 linii |
| Decrypt notes_encrypted w GET [id] | `app/api/treatment-records/[id]/route.ts` | Claude | Edit ~15 linii |
| Strona: lista kart klienta | `app/(dashboard)/[slug]/clients/[id]/treatment-records/page.tsx` | **Gemini** | ~180 linii |

**Encrypt/decrypt pattern (Claude edit):**
```typescript
// W POST handler, przed insert:
import { encryptField } from '@/lib/forms/encryption'
const notes_encrypted = body.notes ? await encryptField(body.notes) : null

// W GET [id] handler, po fetch:
import { decryptField } from '@/lib/forms/encryption'
const notes = record.notes_encrypted ? await decryptField(record.notes_encrypted) : null
// Zwróć { ...record, notes_encrypted: undefined, notes }
```

**Typy dla Gemini (wkleić w prompt):**
```typescript
// Z types/supabase.ts (wklej faktyczne pole po regen):
type TreatmentRecord = {
  id: string
  salon_id: string
  booking_id: string | null
  client_id: string
  employee_id: string
  service_id: string | null
  performed_at: string
  parameters: Record<string, unknown>
  notes_encrypted: string | null
  data_category: 'general' | 'health' | 'sensitive_health'
  created_at: string
  updated_at: string
}
```

**Prompt Gemini dla listy:**
```
Generate a Next.js 14 'use client' page at:
app/(dashboard)/[slug]/clients/[id]/treatment-records/page.tsx

Types needed:
[wklej TreatmentRecord type powyżej]

Requirements:
- Fetch from GET /api/treatment-records?client_id=[id]
- Display as table/list: performed_at, service name (if available), employee, data_category badge, link to record
- data_category badge colors: general=gray, health=yellow, sensitive_health=red
- Button "Nowa karta zabiegu" → links to ./treatment-records/new (visible only for owner/manager)
- Role check: use useCurrentRole() hook from @/hooks/use-current-role
- Loading skeleton, empty state
- No photos in this view (thumbnail comes in L2-E)

Output ONLY valid TypeScript/TSX. No markdown, no explanations.
```

### Sesja 2 — Formularz tworzenia + Widok karty

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Strona: formularz nowej karty | `app/(dashboard)/[slug]/clients/[id]/treatment-records/new/page.tsx` | **Gemini** | ~200 linii |
| Strona: widok pojedynczej karty | `app/(dashboard)/[slug]/clients/[id]/treatment-records/[recordId]/page.tsx` | **Gemini** | ~150 linii |

**Prompt Gemini dla nowej karty:**
```
Generate a Next.js 14 'use client' page at:
app/(dashboard)/[slug]/clients/[id]/treatment-records/new/page.tsx

Types needed:
[wklej TreatmentRecord type]

Requirements:
- Form fields: performed_at (DateTimePicker, default=now), service_id (select from /api/services),
  employee_id (select from /api/employees), data_category (select: general/health/sensitive_health),
  parameters (dynamic key-value pairs — start with empty, "Dodaj parametr" button),
  notes (textarea — plain text, encrypted by API)
- If URL has ?bookingId=[id]: prefill booking_id (hidden), fetch booking data to prefill service/employee
- POST to /api/treatment-records on submit
- On success: navigate to /[slug]/clients/[id]/treatment-records/[newId]
- Validation: required fields must be filled
- Only owner/manager can access (redirect employee to /[slug]/clients/[id])

Output ONLY valid TypeScript/TSX. No markdown, no explanations.
```

**Prompt Gemini dla widoku karty:**
```
Generate a Next.js 14 'use client' page at:
app/(dashboard)/[slug]/clients/[id]/treatment-records/[recordId]/page.tsx

Types needed:
[wklej TreatmentRecord type]

Requirements:
- Fetch from GET /api/treatment-records/[recordId]
- Display: performed_at, service, employee, data_category (badge), parameters (key-value display),
  notes (decrypted — comes from API as 'notes' field, not notes_encrypted)
- Edit button (owner/manager only) → inline edit mode for parameters and notes
- PATCH to /api/treatment-records/[recordId] on save
- Back button → ./treatment-records (parent list)
- Audit note: "Dostęp do tej karty jest rejestrowany" jeśli data_category != 'general'
- NO photos section yet (placeholder: "Zdjęcia dostępne wkrótce")

Output ONLY valid TypeScript/TSX. No markdown, no explanations.
```

### Sesja 3 — Link z bookingu + tsc check

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Link z booking view do listy kart klienta | `components/calendar/booking-dialog.tsx` lub booking view | **Codex** | ~20 linii |
| tsc check + fix drobnych błędów | — | Claude | `npx tsc --noEmit` |

---

## Kryteria wyjścia (Definition of Done)

- [ ] `/clients/[id]/treatment-records` — lista kart z badge data_category
- [ ] `/clients/[id]/treatment-records/new` — formularz z prefill z bookingu (jeśli ?bookingId)
- [ ] `/clients/[id]/treatment-records/[recordId]` — widok karty z notatkmi
- [ ] Employee widzi listę (read-only), nie widzi przycisku "Nowa karta", redirect z new/edit
- [ ] `notes_encrypted` w DB jest zaszyfrowane AES-256-GCM — raw tekst nie jest w bazie
- [ ] Decrypt działa: API zwraca `notes` (plain), nie `notes_encrypted`
- [ ] `npx tsc --noEmit` — 0 błędów

---

## Ryzyka i obejścia

| Ryzyko | Obejście |
|--------|---------|
| Gemini używa hook/komponentu którego nie ma w projekcie | W prompcie daj listę dostępnych hooks: `useCurrentRole` z `@/hooks/use-current-role` |
| encryptField/decryptField mają inną sygnaturę | Przeczytaj `lib/forms/encryption.ts` przed edycją API |
| Parametry (key-value) — Gemini generuje zbyt złożony komponent | Simplify: w prompcie napisz "dynamic list of {key: string, value: string} pairs" |
| Strony Gemini > 200 linii — Gemini dodaje prefix | `head -3` po każdym exec |

---

## Resume command (następna sesja)

```
Przeczytaj docs/sprints/L2-B_treatment-records-ui.md.
Sprawdź: ls app/(dashboard)/[slug]/clients/[id]/treatment-records/ (które strony istnieją).
Sprawdź: grep -n 'encryptField' app/api/treatment-records/route.ts (czy szyfrowanie dodane).
Kontynuuj od pierwszego niezamkniętego task.
```
