# Sprint SS2.2-09 — Treatment Plans: Core Fixes + Plan Detail

## Cel
Dokończenie modułu planów leczenia: naprawienie buga z `session_count`, widok detalu planu, edycja i usuwanie.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/data-architecture.md and docs/architecture/bounded-contexts.md. Summarize: (1) treatment_plans and treatment_sessions schema and relationships, (2) Treatment Records bounded context ownership and rules, (3) health data encryption requirements for form fields. Max 50 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Schema `treatment_plans`, `treatment_sessions`, `form_templates`, relacje z `bookings` i `clients` |
| `docs/architecture/bounded-contexts.md` | "Treatment Records" context — reguły biznesowe planów, kto może edytować/usuwać |
| `docs/architecture/security-model.md` | Health data encryption: pola `health`/`sensitive_health` w `client_forms` muszą być AES-256-GCM |

**Kluczowe constraints:**
- `treatment_plans` i `treatment_sessions` mają `salon_id` — wszystkie queries filtrować
- Treatment plans: owner + manager mogą tworzyć/edytować/usuwać (nie employee)
- `treatment_sessions` pre-tworzone przy tworzeniu planu — DELETE planu musi usunąć sesje (kaskada lub explicit)
- `session_count` bug: liczyć `WHERE status='completed'` — nie `COUNT(*)` wszystkich sesji
- Feature flag: `treatment_records` — sprawdź czy aktywna przed operacjami

## Stan aktualny (z analizy kodu)
- **Bug:** `session_count` w API zwraca liczbę PRE-STWORZONYCH sesji (total), nie liczbę UKOŃCZONYCH — progress pokazuje `10/10` od razu
- **Brak:** strona detalu planu (`/clients/[id]/treatment-plans/[planId]/page.tsx`) istnieje ale prawdopodobnie pusta/placeholder
- **Brak:** edycja planu (nazwa, notatki, status)
- **Brak:** usuwanie planu
- `app/api/treatment-plans/[id]/route.ts` — istnieje, nieznany stan

## Zakres tego sprintu
- [ ] Fix bug `session_count`: liczyć sesje ze statusem `completed`, nie wszystkie
- [ ] `GET /api/treatment-plans/[id]` — szczegóły planu + lista sesji
- [ ] `PATCH /api/treatment-plans/[id]` — edycja (name, notes, status)
- [ ] `DELETE /api/treatment-plans/[id]` — usuwanie planu i sesji
- [ ] Strona detalu planu — lista sesji, edycja, usuwanie

## Pliki do modyfikacji / stworzenia

| Plik | Akcja | Worker |
|------|-------|--------|
| `app/api/treatment-plans/route.ts` | EDIT (fix session_count bug) | codex-main |
| `app/api/treatment-plans/[id]/route.ts` | EDIT (complete all handlers) | codex-main |
| `app/(dashboard)/[slug]/clients/[id]/treatment-plans/[planId]/page.tsx` | EDIT (flesh out) | codex-dad |

## Zależności
- **Wymaga:** nic (sprint niezależny)
- **Blokuje:** sprint-10 (session management)

---

## Krok 0 — Odczyt przed dispatchem

```bash
gemini -p "Read app/api/treatment-plans/route.ts and app/api/treatment-plans/[id]/route.ts. Show all handlers, queries, and what's missing. Max 50 lines." --output-format text 2>/dev/null | grep -v "^Loaded"

gemini -p "Read app/(dashboard)/[slug]/clients/[id]/treatment-plans/[planId]/page.tsx. What's implemented? What's missing? Max 50 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

---

## Prompt — codex-main (API fixes + complete handlers)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read app/api/treatment-plans/route.ts and app/api/treatment-plans/[id]/route.ts.

Goal 1 — Fix session_count bug in app/api/treatment-plans/route.ts:
File: app/api/treatment-plans/route.ts
In GET handler: change session_count calculation to count only sessions WHERE status='completed' (not all sessions for the plan).
Add completed_sessions and total_sessions as separate fields in response:
{ ...plan, total_sessions: plan.total_sessions, completed_sessions: countCompleted }
Remove the old session_count field or rename it for backward compat.

Goal 2 — Complete handlers in app/api/treatment-plans/[id]/route.ts:
File: app/api/treatment-plans/[id]/route.ts

GET handler (if missing or incomplete):
- Fetch treatment plan by id + salon_id (auth via getAuthContext)
- Include sessions list: select from treatment_sessions WHERE plan_id=id ORDER BY session_number ASC
- Return plan + sessions array

PATCH handler (add if missing):
- Body: { name?: string; notes?: string; status?: 'planned' | 'active' | 'completed' | 'cancelled' }
- Validate: only owner/manager can update
- Update treatment_plans SET name, notes, status, updated_at WHERE id=id AND salon_id=salonId
- Return updated plan

DELETE handler (add if missing):
- Validate: only owner/manager
- Delete treatment_sessions WHERE plan_id=id AND salon_id=salonId (cascade or explicit)
- Delete treatment_plans WHERE id=id AND salon_id=salonId
- Return 204

All handlers use getAuthContext().
Done when: all three handlers exist and session_count bug is fixed."
```

---

## Prompt — codex-dad (plan detail page)

```bash
DAD_PROMPT="Read app/(dashboard)/[slug]/clients/[id]/treatment-plans/page.tsx for UI patterns.
Read app/api/treatment-plans/[id]/route.ts for GET response shape (plan + sessions).

Goal: Build out the treatment plan detail page.
File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/clients/[id]/treatment-plans/[planId]/page.tsx

Page layout (server component with client islands):
1. Header: plan name + back button to /clients/[id]/treatment-plans
   Status badge (planned=gray, active=blue, completed=green, cancelled=red)
   Progress: 'X / Y sesji ukończonych' (use completed_sessions/total_sessions from API)

2. Plan actions (owner/manager only):
   - Edit button: opens dialog to edit name, notes, status (PATCH /api/treatment-plans/[id])
   - Delete button: confirm dialog → DELETE /api/treatment-plans/[id] → redirect to plans list

3. Sessions list:
   - Table or card list: Session #, Status, Booking link (if linked), Notes, Date
   - Status: planned=gray, completed=green, skipped=orange
   - Each session will be manageable in sprint-10 (add TODO comment for actions)
   - Empty state if no sessions

4. Notes section: display plan.notes (read-only here, editable via Edit dialog)

Use shadcn/ui: Card, Badge, Button, Dialog, Table.
Import from individual paths.
Done when: page renders plan details, sessions list, and edit/delete work." bash ~/.claude/scripts/dad-exec.sh
```

---

## Po wykonaniu

```bash
npx tsc --noEmit
```

## Done when
- `session_count` bug naprawiony — nowe plany pokazują `0/N` nie `N/N`
- `GET /api/treatment-plans/[id]` zwraca plan + sesje
- `PATCH` i `DELETE` działają
- Strona detalu planu wyświetla sesje i umożliwia edycję/usunięcie
- `tsc --noEmit` clean
