# Sprint L3-A — Clinical Audit Trail

- Status: **TODO** — **Warstwa 2: Traceability** (v2.0 CORE)
- Zależności: L2-A sesja 1 (tabela musi istnieć przed instrumentacją)
- Szacowany czas: 2 sesje Claude
- **Dlaczego w v2.0 jako fundament (nie feature):** Audit trail to infrastruktura traceability — odpowiedź na "co się stało" gdy cokolwiek pójdzie nie tak z danymi zdrowotnymi. Każdy salon który przechowuje health questionnaire, encrypted notes lub zdjęcia zdrowotne ma ten problem niezależnie od segmentu. To nie jest "compliance dla klinik" — to "wiemy co się wydarzyło" dla nas samych jako operatora platformy.

---

## Cel

Immutable log każdego odczytu odszyfrowanych danych zdrowotnych. Append-only — brak DELETE w RLS. Viewer dla owner. Fundament traceability: jeśli klient złoży skargę GDPR lub coś pójdzie nie tak, wiemy dokładnie kto i kiedy widział jego dane zdrowotne.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/SS2.0/v2.0-definition.md` sekcja 3.2 (Clinical Audit Trail) | Feature spec, append-only, owner-only viewer |
| `docs/architecture/security-model.md` | Audit logging requirements, RBAC, "kto co kiedy" |
| `docs/architecture/data-architecture.md` | Retention: audit logs 5 lat, sensitivity T4/T5 |
| `docs/legal/medical-data-supabase-gdpr-guidance.md` | GDPR Art. 5(1)(f) — rozliczalność, integralność |
| `docs/architecture/bounded-contexts.md` | Documents & Forms + Treatment Records — obie domeny generują health data access |
| `docs/architecture/adr/004-tenant-isolation.md` | **Kluczowy ADR** — audit log musi mieć `salon_id NOT NULL`; brak DELETE policy to wzmocnienie izolacji — jeden tenant nie może skasować logów drugiego; RLS SELECT tylko owner |
| `docs/architecture/adr/002-domain-modules.md` | Audit trail to osobny cross-cutting module `lib/audit/` — NIE wewnątrz `lib/forms/` ani `lib/treatment-records/`; cross-domain: loguje dostęp do danych z obu domen |
| `docs/architecture/adr/001-modular-monolith.md` | `lib/audit/` jako shared infrastructure module (jak `lib/supabase/`) — może być importowany przez dowolny domain module; to dopuszczalne wyjście poza strict domain boundaries dla infrastruktury cross-cutting |
| `docs/architecture/service-architecture.md` | `logHealthDataAccess()` jest fire-and-forget — nie blokuje main request; używa admin client (bypasses RLS); log failure = `console.error`, nigdy `throw` |
| `docs/architecture/data-architecture.md` | Audit logs: T4 data, retention 5 lat, append-only; kolumna `accessed_at` — tylko zapis, nigdy UPDATE |

---

## Pliki kontekstowe (czytać na początku sesji)

```
lib/forms/encryption.ts                                     ← tu jest decryptField — dodamy log call
app/api/treatment-records/[id]/route.ts                     ← GET z decryptem — dodamy log call
app/api/forms/public/[token]/route.ts                       ← GET publiczny formularza — check czy decrypt
types/supabase.ts                                           ← wzorzec tabel, istniejący audit_logs jeśli jest
lib/supabase/get-auth-context.ts                            ← sygnatura (userId, salonId)
app/(dashboard)/[slug]/settings/                            ← ls — wzorzec settings pages
```

---

## Scope

### Sesja 1 — SQL + Log Function

| Task | Plik | Kto | Metoda |
|------|------|-----|--------|
| SQL: health_data_access_logs | `supabase/migrations/YYYYMMDD_health_data_access_logs.sql` | **Gemini** | `gemini -p` |
| Regenerate Supabase types | `types/supabase.ts` | Claude | bash |
| Log write function | `lib/audit/health-access-log.ts` | **Codex** | ~50 linii |
| Instrument: decrypt w forms/encryption.ts | `lib/forms/encryption.ts` | Claude | Edit ~10 linii |
| Instrument: GET treatment-records/[id] | `app/api/treatment-records/[id]/route.ts` | Claude | Edit ~8 linii |

**Prompt Gemini dla SQL:**
```
Generate a PostgreSQL migration for Supabase.

Create table 'health_data_access_logs' with these columns:
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id: uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- accessed_by: uuid NOT NULL REFERENCES auth.users(id)
- accessed_by_role: text NOT NULL
- resource_type: text NOT NULL CHECK (resource_type IN ('form_response', 'treatment_record', 'treatment_photo'))
- resource_id: uuid NOT NULL
- client_id: uuid REFERENCES clients(id) ON DELETE SET NULL
- data_category: text NOT NULL CHECK (data_category IN ('health', 'sensitive_health'))
- action: text NOT NULL CHECK (action IN ('decrypt', 'view', 'export'))
- accessed_at: timestamptz NOT NULL DEFAULT now()
- ip_address: text
- user_agent: text

RLS:
- Enable RLS
- SELECT: salon_id = public.get_user_salon_id() AND has_salon_role('owner')
  -- Only owner can view audit logs
- INSERT: salon_id = public.get_user_salon_id()
  -- Any authenticated user (server-side app writes via service role)
  -- Actually use service role for inserts from API routes — no RLS needed for INSERT if using admin client
- NO UPDATE policy
- NO DELETE policy  ← CRITICAL: append-only

Indexes: (salon_id, accessed_at DESC), (salon_id, client_id), (salon_id, accessed_by)

IMPORTANT: Do NOT create UPDATE or DELETE policies. The table is append-only.

Output ONLY valid SQL. No markdown, no explanations.
```

**Prompt Codex dla log function:**
```
Read lib/supabase/get-auth-context.ts, types/supabase.ts (health_data_access_logs section),
lib/supabase/admin.ts for context.
Do NOT use Gemini — write directly.

Create lib/audit/health-access-log.ts

Export async function logHealthDataAccess(params: {
  salonId: string
  accessedBy: string        // user id
  accessedByRole: string    // 'owner' | 'manager' | 'employee'
  resourceType: 'form_response' | 'treatment_record' | 'treatment_photo'
  resourceId: string
  clientId?: string
  dataCategory: 'health' | 'sensitive_health'
  action: 'decrypt' | 'view' | 'export'
  ipAddress?: string
  userAgent?: string
}): Promise<void>

Implementation:
- Use createAdminSupabaseClient() (bypasses RLS for INSERT — this is a server-only function)
- INSERT into health_data_access_logs
- On error: console.error (do NOT throw — logging failure must not break the main request)
- This function should never be called from client-side code

Write the file directly.
```

**Instrument w `lib/forms/encryption.ts` (Claude edit):**
```typescript
// NIE modyfikuj encryptField — szyfrowanie nie wymaga logu
// W decryptField — dodaj optional param i log:
export async function decryptField(
  encryptedValue: string,
  auditContext?: {
    salonId: string; userId: string; role: string;
    resourceType: 'form_response' | 'treatment_record'; resourceId: string;
    clientId?: string; dataCategory: 'health' | 'sensitive_health';
  }
): Promise<string> {
  // ... istniejąca logika decrypt ...
  if (auditContext) {
    // Fire-and-forget — nie await
    logHealthDataAccess({
      salonId: auditContext.salonId,
      accessedBy: auditContext.userId,
      accessedByRole: auditContext.role,
      resourceType: auditContext.resourceType,
      resourceId: auditContext.resourceId,
      clientId: auditContext.clientId,
      dataCategory: auditContext.dataCategory,
      action: 'decrypt',
    }).catch(console.error)
  }
  return decrypted
}
```

**Instrument w treatment-records/[id]/route.ts (Claude edit):**
```typescript
// Po decryptField call — dodaj auditContext:
const notes = record.notes_encrypted ? await decryptField(record.notes_encrypted, {
  salonId: authCtx.salonId,
  userId: authCtx.user.id,
  role: authCtx.role,  // z JWT app_metadata
  resourceType: 'treatment_record',
  resourceId: params.id,
  clientId: record.client_id,
  dataCategory: record.data_category as 'health' | 'sensitive_health',
}) : null
```

### Sesja 2 — Settings UI Viewer

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Settings page: audit log viewer | `app/(dashboard)/[slug]/settings/audit-log/page.tsx` | **Gemini** | ~200 linii |
| Dodaj link audit-log do settings nav | `components/settings/settings-nav.tsx` | Claude | Edit ~5 linii |
| API: GET audit logs | `app/api/audit/health-access/route.ts` | **Codex** | ~60 linii |

**Typy dla Gemini:**
```typescript
type HealthDataAccessLog = {
  id: string
  accessed_by: string
  accessed_by_role: string
  resource_type: 'form_response' | 'treatment_record' | 'treatment_photo'
  resource_id: string
  client_id: string | null
  data_category: 'health' | 'sensitive_health'
  action: 'decrypt' | 'view' | 'export'
  accessed_at: string
  ip_address: string | null
}
```

**Prompt Gemini dla audit-log page:**
```
Generate a Next.js 14 'use client' page at:
app/(dashboard)/[slug]/settings/audit-log/page.tsx

This is an OWNER-ONLY page. Redirect non-owners to /[slug]/settings.

Types needed:
[wklej HealthDataAccessLog type]

Requirements:
- Fetch from GET /api/audit/health-access (paginated, ?limit=50&offset=0)
- Table columns: Data dostępu (accessed_at), Użytkownik (accessed_by_role), Typ zasobu, Kategoria danych (badge: health=yellow, sensitive_health=red), Akcja
- Filter: date range picker (from/to), data_category filter
- No edit, no delete — read-only view
- Informacja na górze: "Logi są przechowywane przez 5 lat i nie mogą być usunięte."
- Loading skeleton, empty state

Output ONLY valid TypeScript/TSX. No markdown, no explanations.
```

**Prompt Codex dla API:**
```
Read lib/supabase/get-auth-context.ts, types/supabase.ts (health_data_access_logs section).
Do NOT use Gemini — write directly.

Create app/api/audit/health-access/route.ts
- GET only
- Require owner role: if not owner → 403
- Query health_data_access_logs: filter by salon_id, optional ?from, ?to (date range), ?data_category
- Order by accessed_at DESC
- Paginate: ?limit (default 50, max 100), ?offset
- Return { logs: HealthDataAccessLog[], total: number }

Write the file directly.
```

---

## Kryteria wyjścia (Definition of Done)

- [ ] `supabase db push` — migracja `health_data_access_logs` zastosowana (APPEND-ONLY)
- [ ] Brak DELETE policy na `health_data_access_logs` — potwierdź przez `SELECT * FROM pg_policies WHERE tablename='health_data_access_logs'`
- [ ] `decryptField` z `auditContext` zapisuje log (fire-and-forget)
- [ ] GET `/api/treatment-records/[id]` z health/sensitive_health → log entry w `health_data_access_logs`
- [ ] GET `/api/audit/health-access` — employee/manager dostają 403, owner widzi logi
- [ ] `/settings/audit-log` dostępny tylko dla owner (redirect dla manager/employee)
- [ ] `npx tsc --noEmit` — 0 błędów

---

## Ryzyki i obejścia

| Ryzyko | Obejście |
|--------|---------|
| Gemini tworzy DELETE policy przez pomyłkę | Sprawdź SQL przed `supabase db push`; usuń DELETE policy jeśli jest |
| logHealthDataAccess rzuca wyjątek i łamie request | ZAWSZE `catch(console.error)` — log failure nie może przerywać flow |
| Zbyt dużo logów od CRON/automation (background decrypt) | CRON używa admin clienta bez auditContext → nie loguje (to zamierzone — logi tylko dla user requests) |
| decryptField signature zmiana łamie istniejące call sites | Nowy param jest OPTIONAL — backward compatible |

---

## Resume command (następna sesja)

```
Przeczytaj docs/sprints/L3-A_clinical-audit-trail.md.
Sprawdź: ls supabase/migrations/ | grep audit (czy migracja jest).
Sprawdź: ls lib/audit/ (czy logHealthDataAccess istnieje).
Sprawdź: grep -n 'auditContext' lib/forms/encryption.ts (czy instrument dodany).
Kontynuuj od pierwszego niezamkniętego task.
```
