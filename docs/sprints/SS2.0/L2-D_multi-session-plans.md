# Sprint L2-D — Multi-Session Treatment Plans

- Status: **TODO** (po L2-C) — wersja **UPROSZCZONA dla v2.0**
- Zależności: L2-A (treatment_records), L2-C (treatment_protocols — plan może mieć protokół)
- Szacowany czas: **2 sesje** (v2.0 uproszczone), 3 sesje (pełna wersja — v2.x)

### Scope v2.0 — Reliability: pełna traceability serii zabiegów
Klient ma plan, każda sesja jest zaznaczona (zrobiona/anulowana), postęp widoczny w profilu.
Reliability: żadna sesja nie ginie, żaden stan nie jest niejasny. Bez tego możemy mieć sytuację
"ile sesji zrobiliśmy?" — odpowiedź musi być deterministyczna.

### Poza scope v2.0 — Automation (defer do v2.x po INFRA-A)
- Automation hook "triggeruj SMS/email po sesji" — wymaga event bus (INFRA-A)
- Auto-booking kolejnej sesji — wymaga integracji z Scheduling domain
- Zaznaczone w kodzie jako `TODO(INFRA-A-event-bus)` — nie implementować teraz

---

## Cel

Plany wielosesyjne — klient ma 10 zabiegów laserowych, system śledzi postęp i może triggerować automatyczne powiadomienia po każdej sesji. Plan jest widoczny w profilu klienta z progress trackerem.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/SS2.0/v2.0-definition.md` sekcja 3.2 (Multi-Session Plans) | Feature spec, session statuses, automation hook |
| `docs/architecture/automation-engine.md` | Jak podłączyć trigger po zakończeniu sesji |
| `docs/architecture/event-architecture.md` | Event catalogue — `treatment.completed`, trigger mechanizm |
| `docs/architecture/data-architecture.md` | Relacja plan → sessions → treatment_records |
| `docs/architecture/bounded-contexts.md` | Treatment Records context — plany jako sub-domain |
| `docs/architecture/adr/003-event-driven-workflows.md` | **Kluczowy ADR** — automation hook po zakończeniu sesji: NIE wywołuj SMS/email bezpośrednio w route handlerze; emituj event `treatment_plan.session_completed` do event bus z L2-D+; sprint implementuje tylko placeholder z tagiem `TODO(INFRA-A-event-bus)` — pełna integracja po INFRA-A |
| `docs/architecture/event-architecture.md` | Event envelope: `{ id, type: 'treatment_plan.completed', version: 1, occurredAt, tenantId: salonId, aggregateId: planId, payload: { clientId, totalSessions } }` — takiego payloadu używa placeholder TODO |
| `docs/architecture/service-architecture.md` | Thin route handler: tworzenie planu + sesji → `lib/treatment-records/plans.ts`; route tylko waliduje i zwraca; auto-creation sesji to logika serwisowa |
| `docs/architecture/adr/002-domain-modules.md` | Plany i sesje to sub-module Treatment Records — `lib/treatment-records/plans.ts`; nie twórz osobnego `lib/treatment-plans/` |
| `docs/architecture/adr/004-tenant-isolation.md` | Obie tabele (treatment_plans + treatment_sessions) — salon_id NOT NULL, RLS wzorzec identyczny z treatment_records |

---

## Pliki kontekstowe (czytać na początku sesji)

```
types/supabase.ts                               ← treatment_records, treatment_protocols, clients
lib/supabase/get-auth-context.ts                ← sygnatura
app/api/treatment-records/route.ts              ← wzorzec API
app/(dashboard)/[slug]/clients/[id]/treatment-records/page.tsx  ← istniejący list (L2-B)
app/api/cron/surveys/route.ts                   ← view_range: 1-60 — wzorzec automation triggera
lib/messaging/                                  ← ls — dostępne sendery
```

---

## Scope

### Sesja 1 — SQL Schema

| Task | Plik | Kto | Metoda |
|------|------|-----|--------|
| SQL: treatment_plans + treatment_sessions | `supabase/migrations/YYYYMMDD_treatment_plans.sql` | **Gemini** | `gemini -p` |
| Regenerate Supabase types | `types/supabase.ts` | Claude | bash |

**Prompt Gemini dla SQL:**
```
Generate a PostgreSQL migration for Supabase. Create 2 tables.

TABLE 1: 'treatment_plans'
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id: uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- client_id: uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE
- service_id: uuid REFERENCES services(id) ON DELETE SET NULL
- protocol_id: uuid REFERENCES treatment_protocols(id) ON DELETE SET NULL
- name: text NOT NULL
- total_sessions: integer NOT NULL CHECK (total_sessions > 0)
- status: text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled'))
- started_at: timestamptz
- completed_at: timestamptz
- notes: text
- created_at: timestamptz NOT NULL DEFAULT now()
- updated_at: timestamptz NOT NULL DEFAULT now()

TABLE 2: 'treatment_sessions'
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- plan_id: uuid NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE
- salon_id: uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- session_number: integer NOT NULL
- status: text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','cancelled'))
- booking_id: uuid REFERENCES bookings(id) ON DELETE SET NULL
- treatment_record_id: uuid REFERENCES treatment_records(id) ON DELETE SET NULL
- scheduled_at: timestamptz
- completed_at: timestamptz
- notes: text
- created_at: timestamptz NOT NULL DEFAULT now()
- UNIQUE (plan_id, session_number)

RLS for treatment_plans:
- Enable RLS
- SELECT: salon_id = public.get_user_salon_id()
- INSERT/UPDATE: salon_id = public.get_user_salon_id() AND has_any_salon_role(ARRAY['owner','manager'])
- DELETE: has_salon_role('owner')

RLS for treatment_sessions: same pattern as treatment_plans.

Indexes: treatment_plans(salon_id, client_id), treatment_sessions(plan_id), treatment_sessions(salon_id, booking_id)

Triggers: updated_at for both tables.

Output ONLY valid SQL. No markdown, no explanations.
```

### Sesja 2 — API Routes

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| API: treatment-plans CRUD | `app/api/treatment-plans/route.ts` + `app/api/treatment-plans/[id]/route.ts` | **Codex** | ~160 linii total |
| API: treatment-sessions CRUD | `app/api/treatment-plans/[id]/sessions/route.ts` + `app/api/treatment-plans/[id]/sessions/[sessionId]/route.ts` | **Codex** | ~160 linii total |
| Automation hook: session completed | `app/api/treatment-plans/[id]/sessions/[sessionId]/route.ts` | Claude | Edit ~20 linii |

**Prompt Codex dla API (batch 4 pliki):**
```
Read lib/supabase/get-auth-context.ts, types/supabase.ts (treatment_plans + treatment_sessions sections),
app/api/treatment-records/route.ts for context and pattern.
Do NOT use Gemini — write directly.

FILE 1: app/api/treatment-plans/route.ts
- GET: list plans for salon, filter by ?client_id, include session count
- POST: create plan + auto-create N empty sessions (total_sessions)

FILE 2: app/api/treatment-plans/[id]/route.ts
- GET: single plan with all sessions ordered by session_number
- PATCH: update name, status, notes
- DELETE: owner only

FILE 3: app/api/treatment-plans/[id]/sessions/route.ts
- GET: list sessions for plan
- No POST (sessions auto-created with plan)

FILE 4: app/api/treatment-plans/[id]/sessions/[sessionId]/route.ts
- GET: single session
- PATCH: update status (planned→completed/cancelled), booking_id, treatment_record_id, completed_at

Write all 4 files directly.
```

**Automation hook — Claude edit po Codex:**
```typescript
// W PATCH sessionId route, po update session do status='completed':
// 1. Sprawdź czy to ostatnia sesja (session_number === plan.total_sessions)
// 2. Jeśli tak: UPDATE plan SET status='completed', completed_at=now()
// 3. Automation placeholder (NIE wywołuj SMS/maila bezpośrednio — per ADR-003):
// TODO(INFRA-A-event-bus): emit('treatment_plan.completed', {
//   tenantId: salonId,
//   aggregateId: plan.id,
//   payload: { clientId: plan.client_id, totalSessions: plan.total_sessions }
// })
console.log('[TREATMENT-PLAN] Plan completed — automation pending event bus (INFRA-A)')
// Search tag: INFRA-A-event-bus — zastąp gdy lib/events/bus.ts zostanie zaimplementowany
```

### Sesja 3 — UI

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Strona: lista planów klienta | `app/(dashboard)/[slug]/clients/[id]/treatment-plans/page.tsx` | **Gemini** | ~180 linii |
| Widok planu z progress trackerem | `app/(dashboard)/[slug]/clients/[id]/treatment-plans/[planId]/page.tsx` | **Gemini** | ~220 linii |
| Link z profilu klienta → plany | istniejąca strona klienta lub treatment-records page | Claude | Edit ~5 linii |

**Typy dla Gemini:**
```typescript
type TreatmentPlan = {
  id: string
  client_id: string
  service_id: string | null
  protocol_id: string | null
  name: string
  total_sessions: number
  status: 'active' | 'completed' | 'cancelled'
  started_at: string | null
  completed_at: string | null
  notes: string | null
  sessions?: TreatmentSession[]
}

type TreatmentSession = {
  id: string
  plan_id: string
  session_number: number
  status: 'planned' | 'completed' | 'cancelled'
  booking_id: string | null
  treatment_record_id: string | null
  scheduled_at: string | null
  completed_at: string | null
}
```

**Prompt Gemini dla widoku planu:**
```
Generate a Next.js 14 'use client' page at:
app/(dashboard)/[slug]/clients/[id]/treatment-plans/[planId]/page.tsx

Types needed:
[wklej typy powyżej]

Requirements:
- Fetch GET /api/treatment-plans/[planId] (returns plan with sessions array)
- Header: plan name, status badge (active=blue, completed=green, cancelled=gray), progress bar
- Progress bar: completed sessions / total sessions (e.g. "3/10 sesji")
- Sessions list: numbered list, each shows: status badge, scheduled_at, completed_at, link to booking/treatment record if available
- For each 'planned' session: button "Oznacz jako zakończona" → PATCH session status=completed
- For each 'planned' session: button "Anuluj sesję" → PATCH status=cancelled
- Owner/manager only: "Anuluj cały plan" → PATCH plan status=cancelled

Output ONLY valid TypeScript/TSX. No markdown, no explanations.
```

---

## Kryteria wyjścia (Definition of Done)

- [ ] `supabase db push` — migracje `treatment_plans` + `treatment_sessions` zastosowane
- [ ] Tworzenie planu auto-generuje N sesji w statusie `planned`
- [ ] PATCH sesji do `completed` → jeśli ostatnia → plan status = `completed`
- [ ] `/clients/[id]/treatment-plans` — lista planów z progress (X/N sesji)
- [ ] `/clients/[id]/treatment-plans/[planId]` — widok z progress bar + lista sesji
- [ ] Employee widzi plany read-only (brak przycisków akcji)
- [ ] `npx tsc --noEmit` — 0 błędów

---

## Ryzyka i obejścia

| Ryzyko | Obejście |
|--------|---------|
| Scope creep: automation triggery | **STOP** przy "TODO: emit event" — nie implementuj pełnego automation w tym sprincie |
| Widok planu > 200 linii → Gemini zbyt złożone | Podziel: lista sesji jako osobny komponent `components/treatment-plans/session-list.tsx` |
| PATCH session + update plan atomowość | Supabase transaction przez RPC lub 2 osobne UPDATE (acceptable dla MVP) |

---

## Resume command (następna sesja)

```
Przeczytaj docs/sprints/L2-D_multi-session-plans.md.
Sprawdź: ls supabase/migrations/ | grep plans (czy migracja jest).
Sprawdź: ls app/api/treatment-plans/ (które pliki API istnieją).
Kontynuuj od pierwszego niezamkniętego task.
```
