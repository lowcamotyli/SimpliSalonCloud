# Sprint L2-C — Treatment Protocols

- Status: **TODO** (po L2-B)
- Zależności: L2-A (treatment_records tabela istnieje), L2-B (formularz karty istnieje — tu dodamy autofill)
- Szacowany czas: 2 sesje Claude

---

## Cel

Szablony protokołów zabiegowych — wielokrotnie używane zestawy pól/parametrów przypisane do usługi. Przy tworzeniu karty zabiegu: wybierz protokół → pola się autofillują.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/SS2.0/v2.0-definition.md` sekcja 3.2 (Treatment Protocols) | Feature spec: wersjonowanie, assign to service |
| `docs/architecture/data-architecture.md` | Soft versioning pattern (version: int, no event sourcing) |
| `docs/architecture/bounded-contexts.md` | Treatment Records context — protokoły jako część tej domeny |
| `docs/architecture/domain-map.md` | Relacja: Protocols ↔ Services ↔ Treatment Records |
| `docs/architecture/security-model.md` | RBAC — kto zarządza protokołami |
| `docs/architecture/adr/002-domain-modules.md` | **Kluczowy ADR** — protokoły to sub-module Treatment Records domain, NIE osobny moduł; eksportuj przez `lib/treatment-records/protocols.ts`, nie przez własne `lib/protocols/` |
| `docs/architecture/adr/004-tenant-isolation.md` | Tabela `treatment_protocols` — identyczny wzorzec RLS co `treatment_records`; salon_id isolation |
| `docs/architecture/adr/005-document-form-system.md` | Pola protokołu (`fields` JSONB) to klasyfikacja `general` — nie zawierają danych klienta, nie wymagają szyfrowania; ale jeśli protocol_name/description ujawnia diagnozę → reconsider |
| `docs/architecture/service-architecture.md` | Autofill w formularzu to logika w `lib/treatment-records/protocols.ts` (znajdź protokół, zmapuj pola) — nie inline w route handlerze |

---

## Pliki kontekstowe (czytać na początku sesji)

```
types/supabase.ts                                          ← wzorzec istniejących tabel + treatment_records
lib/supabase/get-auth-context.ts                           ← sygnatura
app/api/services/route.ts                                  ← view_range: 1-50 — wzorzec services API
app/(dashboard)/[slug]/settings/                           ← ls — wzorzec settings pages
app/(dashboard)/[slug]/clients/[id]/treatment-records/new/page.tsx  ← tu dodamy protocol select
```

---

## Scope

### Sesja 1 — SQL + API

| Task | Plik | Kto | Metoda |
|------|------|-----|--------|
| SQL: treatment_protocols | `supabase/migrations/YYYYMMDD_treatment_protocols.sql` | **Gemini** | `gemini -p` |
| Regenerate Supabase types | `types/supabase.ts` | Claude | bash |
| API CRUD: treatment-protocols | `app/api/treatment-protocols/route.ts` + `app/api/treatment-protocols/[id]/route.ts` | **Codex** | batch |

**Prompt Gemini dla SQL:**
```
Generate a PostgreSQL migration for Supabase.

Create table 'treatment_protocols' with these columns:
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id: uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- service_id: uuid REFERENCES services(id) ON DELETE SET NULL
- name: text NOT NULL
- description: text
- version: integer NOT NULL DEFAULT 1
- fields: jsonb NOT NULL DEFAULT '[]'
  -- Array of: { id: string, label: string, type: 'text'|'number'|'select'|'boolean', options?: string[], required: boolean }
- is_active: boolean NOT NULL DEFAULT true
- created_at: timestamptz NOT NULL DEFAULT now()
- updated_at: timestamptz NOT NULL DEFAULT now()

RLS:
- Enable RLS
- SELECT: salon_id = public.get_user_salon_id() (owner, manager, employee — all can read)
- INSERT/UPDATE: salon_id = public.get_user_salon_id() AND has_any_salon_role(ARRAY['owner','manager'])
- DELETE: salon_id = public.get_user_salon_id() AND has_salon_role('owner')

Indexes: (salon_id, service_id), (salon_id, is_active)

Also add trigger for updated_at.

Output ONLY valid SQL. No markdown, no explanations.
```

**Prompt Codex dla API (batch 2 pliki):**
```
Read lib/supabase/get-auth-context.ts, types/supabase.ts (treatment_protocols section),
app/api/services/route.ts for context.
Do NOT use Gemini — write directly.

FILE 1: app/api/treatment-protocols/route.ts
- GET: list protocols for salon, optional ?service_id filter, only is_active=true by default
- POST: create protocol (owner/manager only)
- Require feature flag 'treatment_records'

FILE 2: app/api/treatment-protocols/[id]/route.ts
- GET: single protocol
- PATCH: update (creates new version — increment version field, keep old as-is in DB... actually: just update in place, version++ on PATCH)
- DELETE (soft via is_active=false, owner only)

Write both files directly.
```

### Sesja 2 — Settings UI + Integration

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Settings page: zarządzanie protokołami | `app/(dashboard)/[slug]/settings/protocols/page.tsx` | **Gemini** | ~220 linii |
| Dodaj link protocols do settings nav | `components/settings/settings-nav.tsx` | Claude | Edit ~5 linii |
| Autofill w formularzu nowej karty | `app/(dashboard)/[slug]/clients/[id]/treatment-records/new/page.tsx` | Claude | Edit ~25 linii |

**Typy dla Gemini:**
```typescript
type TreatmentProtocol = {
  id: string
  salon_id: string
  service_id: string | null
  name: string
  description: string | null
  version: number
  fields: Array<{
    id: string
    label: string
    type: 'text' | 'number' | 'select' | 'boolean'
    options?: string[]
    required: boolean
  }>
  is_active: boolean
  created_at: string
}
```

**Prompt Gemini dla settings/protocols:**
```
Generate a Next.js 14 'use client' page at:
app/(dashboard)/[slug]/settings/protocols/page.tsx

Types needed:
[wklej TreatmentProtocol type]

Requirements:
- List existing protocols (GET /api/treatment-protocols)
- Create new protocol: Dialog form with name, description, service_id (select from /api/services),
  fields builder (add/remove dynamic fields: label, type, required checkbox)
- Edit protocol: same Dialog, PATCH /api/treatment-protocols/[id]
- Deactivate (soft delete): button → PATCH {is_active: false}
- Each protocol shows: name, service name (if assigned), version, field count
- Only owner/manager sees Create/Edit/Delete (use useCurrentRole hook)
- Empty state, loading skeleton

Output ONLY valid TypeScript/TSX. No markdown, no explanations.
```

**Autofill w formularzu (Claude edit):**
```typescript
// W new/page.tsx, po wyborze service_id:
// 1. Fetch GET /api/treatment-protocols?service_id=[selectedServiceId]
// 2. Jeśli są protokoły: pokaż <Select> "Wybierz protokół (opcjonalne)"
// 3. Po wyborze protokołu: ustaw parameters state na basis of protocol.fields
//    (key = field.id, defaultValue = '' dla text/select, 0 dla number, false dla boolean)
// 4. Renderuj dynamic form fields na podstawie wybranego protokołu
```

---

## Kryteria wyjścia (Definition of Done)

- [ ] `supabase db push` — migracja `treatment_protocols` zastosowana
- [ ] `supabase gen types typescript --linked` — protokoły w `types/supabase.ts`
- [ ] GET `/api/treatment-protocols` — employee widzi (read-only), 403 bez feature flag
- [ ] POST/PATCH `/api/treatment-protocols` — tylko owner/manager
- [ ] `/settings/protocols` — CRUD protokołów działa
- [ ] Settings nav zawiera link "Protokoły" (widoczny dla owner/manager)
- [ ] Formularz nowej karty zabiegu: wybór usługi → pokazuje dostępne protokoły → autofill pól
- [ ] `npx tsc --noEmit` — 0 błędów

---

## Ryzyka i obejścia

| Ryzyko | Obejście |
|--------|---------|
| Fields builder (dynamic) w Gemini jest zbyt złożony | Simplify prompt: "static form with max 10 fields, add/remove rows" |
| Autofill zmienia strukturę parameters — niekompatybilne z kartami bez protokołu | Autofill jest opcjonalny: jeśli użytkownik nie wybierze protokołu, parameters = `{}` jak poprzednio |
| settings-nav.tsx duży — Claude nie może edytować | view_range na fragment z listą linków, Edit punktowy |

---

## Resume command (następna sesja)

```
Przeczytaj docs/sprints/L2-C_treatment-protocols.md.
Sprawdź: ls supabase/migrations/ | grep protocol (czy migracja jest).
Sprawdź: ls app/(dashboard)/[slug]/settings/protocols/ (czy strona istnieje).
Kontynuuj od pierwszego niezamkniętego task.
```
