# Sprint SS2.2-10 — Treatment Plans: Session Management

## Cel
Zarządzanie sesjami planu leczenia: oznaczanie jako ukończone, powiązanie z bookingiem, automatyczna aktualizacja statusu planu.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/bounded-contexts.md and docs/architecture/event-architecture.md. Summarize: (1) Treatment Records context rules for session state transitions, (2) any events fired when treatment plan status changes, (3) how session-booking link should work. Max 100 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/bounded-contexts.md` | Reguły tranzycji statusów sesji (planned → completed / skipped), auto-completion planu |
| `docs/architecture/event-architecture.md` | Czy zmiana statusu planu powinna emitować event (np. do CRM automations) |
| `docs/architecture/data-architecture.md` | Schema `treatment_sessions`, relacja z `bookings` (opcjonalny `booking_id`) |

**Kluczowe constraints:**
- Tranzycje statusów sesji: `planned → completed` lub `planned → skipped` (nie wstecz)
- Auto-completion planu: wszystkie sesje `completed` lub `skipped` → plan `completed`; pierwsza `completed` → plan `active`
- `booking_id` na sesji: opcjonalne, FK do `bookings` — waliduj że booking należy do tego samego salonu
- Session actions: owner + manager (nie employee) — sprawdź role w PATCH handler
- Sprawdź `event-architecture.md` czy zmiana statusu planu powinna triggerować event — jeśli tak, dodaj do implementacji

## Stan po sprint-09
- Plan detail page z listą sesji (read-only actions)
- API: `GET/PATCH/DELETE /api/treatment-plans/[id]`
- API: `app/api/treatment-plans/[id]/sessions/route.ts` i `[sessionId]/route.ts` — istnieją, nieznany stan

## Zakres tego sprintu
- [ ] `PATCH /api/treatment-plans/[id]/sessions/[sessionId]` — update sesji (status, notes, booking_id)
- [ ] Automatyczna aktualizacja statusu planu: gdy wszystkie sesje `completed` → plan `completed`
- [ ] UI: akcje sesji — oznacz jako ukończona, pomiń, dodaj notatki
- [ ] UI: powiązanie sesji z istniejącym bookingiem (booking picker)
- [ ] UI: widok sesji w liście bookingów — badge "Część planu leczenia"

## Pliki do modyfikacji / stworzenia

| Plik | Akcja | Worker |
|------|-------|--------|
| `app/api/treatment-plans/[id]/sessions/[sessionId]/route.ts` | EDIT / complete | codex-main |
| `components/treatment-plans/session-actions.tsx` | CREATE | codex-dad |
| `app/(dashboard)/[slug]/clients/[id]/treatment-plans/[planId]/page.tsx` | EDIT (integrate session actions) | codex-dad |

## Zależności
- **Wymaga:** sprint-09

---

## Krok 0 — Odczyt przed dispatchem

```bash
gemini -p "Read app/api/treatment-plans/[id]/sessions/[sessionId]/route.ts and app/api/treatment-plans/[id]/sessions/route.ts. What's implemented? What's the DB schema for treatment_sessions? Max 20 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

---

## Prompt — codex-main (session API complete)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read app/api/treatment-plans/[id]/sessions/[sessionId]/route.ts and app/api/treatment-plans/[id]/route.ts.

Goal: Complete the session update handler with plan auto-completion logic.
File: app/api/treatment-plans/[id]/sessions/[sessionId]/route.ts

PATCH handler:
- Auth: getAuthContext(), require owner or manager
- Validate session belongs to plan AND plan belongs to salon
- Body: { status?: 'planned' | 'completed' | 'skipped'; notes?: string; booking_id?: string | null; session_date?: string }
- Update treatment_sessions SET ... WHERE id=sessionId AND plan_id=planId AND salon_id=salonId
- After update: check if ALL sessions for this plan are either 'completed' or 'skipped'
  If yes AND plan status is 'active' or 'planned': auto-update treatment_plans SET status='completed' WHERE id=planId
  If at least one session moves to 'completed' AND plan status is 'planned': auto-update status='active'
- Return { session: updatedSession; planStatusChanged: boolean; newPlanStatus: string }

GET handler (if missing): return single session details

Validate booking_id if provided: booking must belong to same salon.
Done when: PATCH updates session and auto-updates plan status."
```

---

## Prompt — codex-dad (session actions UI)

```bash
DAD_PROMPT="Read app/(dashboard)/[slug]/clients/[id]/treatment-plans/[planId]/page.tsx and app/api/treatment-plans/[id]/sessions/[sessionId]/route.ts.

File 1: /mnt/d/SimpliSalonCLoud/components/treatment-plans/session-actions.tsx
Client component for managing a single session:
- Props: { session: TreatmentSession; planId: string; onUpdate: () => void }
  where TreatmentSession has: { id, session_number, status, notes, booking_id, session_date }
- Dropdown menu or inline buttons:
  - 'Oznacz jako ukończona' (only if status='planned') → PATCH status='completed'
  - 'Pomiń sesję' (only if status='planned') → PATCH status='skipped', confirmation dialog
  - 'Edytuj notatki' → small dialog with textarea → PATCH notes
  - 'Powiąż z wizytą' → opens booking picker (simple input for bookingId or fetch recent bookings list GET /api/bookings?clientId=...) → PATCH booking_id
- Show session date if set, else 'Brak daty'
- After any action: call onUpdate() to refresh parent
- Use shadcn/ui: DropdownMenu, Dialog, Button, Textarea

File 2 — Edit: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/clients/[id]/treatment-plans/[planId]/page.tsx
Replace the TODO placeholder in sessions list with <SessionActions> component:
- Pass session data and planId
- onUpdate: re-fetch plan data (use router.refresh() or custom refresh handler)
- Import SessionActions from components/treatment-plans/session-actions

Done when: sessions can be marked complete/skipped, notes edited, booking linked." bash ~/.claude/scripts/dad-exec.sh
```

---

## Po wykonaniu

```bash
npx tsc --noEmit
```

## Done when
- Sesje można oznaczać jako ukończone / pominięte
- Plan automatycznie zmienia status na `active` / `completed`
- Notatki do sesji edytowalne
- Sesja powiązana z bookingiem (opcjonalnie)
- `tsc --noEmit` clean

---

## Opcjonalne rozszerzenia (poza scope sprintu, dodaj jako TODO)
- Badge "Część planu leczenia" na booking detail — po zakończeniu całego SS2.2
- Widok postępu planu w dashboard klienta
- Eksport historii sesji do PDF
