# Sprint B2-14 — manual-review-ui + forwarded-email-detection

## Cel
1. UI kolejki manual review — właściciel widzi zablokowane eventy i może je zatwierdzić/odrzucić
2. Detekcja emaili forwardowanych — flagowanie `source: forwarded`, loose matching (historia + przyszłość)

## Faza + Wave (Wave 10 — Sequential po B2-13)
Faza 4, Wave 10.

## Architektura — dokumenty referencyjne
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract repair endpoint design, manual_review status transitions, and any UI constraints for multi-mailbox setup. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

### Kluczowe constraints
- `/api/internal/booksy/repair` endpoint już istnieje — obsługuje `dryRun`, przyjmuje `parsedEventId` + opcjonalny `bookingId` do force-match
- UI: dodać zakładkę *"Do przejrzenia"* na stronie `/settings/integrations/booksy/page.tsx`
- Dane: `booksy_parsed_events` WHERE `status = 'manual_review'` — `review_reason`, `review_detail`, `candidate_bookings`, `payload`, `event_type`
- Akcje: **Zatwierdź dopasowanie** (wybierz z `candidate_bookings` lub wpisz ręcznie) → POST `/api/internal/booksy/repair` z `bookingId`, **Odrzuć** → PATCH status = discarded z `review_reason`
- Forwarded emaile: subject zawiera `Fwd:` / `Fw:` (case-insensitive) LUB `fromAddress` nie zawiera `booksy.com`
  - Oznaczaj w payload jako `source: "forwarded"`
  - W matching: szukaj także wizyt historycznych (status IN cancelled, completed) — nie tylko przyszłych
  - Niższy próg confidence (40 zamiast 60) żeby nie blokować oczywistych przypadków

## Zakres
- [ ] **`app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx`** — dodać zakładkę *"Do przejrzenia"* z listą `manual_review` eventów (review_reason badge, payload summary, candidate_bookings selector, przyciski Zatwierdź/Odrzuć)
- [ ] **`components/dashboard/booksy-status-widget.tsx`** — dodać `manualReviewCount` query + sekcję alertu z linkiem do zakładki "Do przejrzenia" gdy count > 0
- [ ] **`app/api/internal/booksy/manual-review/route.ts`** — GET (lista manual_review dla salonu), PATCH (odrzuć: status→discarded)
- [ ] **`lib/booksy/email-parser.ts`** — detekcja forwarded emaila: ustaw `payload.source = "forwarded"` gdy subject ma Fwd:/Fw: lub fromAddress nie zawiera booksy.com
- [ ] **`lib/booksy/booking-match.ts`** — gdy `payload.source === "forwarded"`: rozszerz search o historyczne wizyty (status IN scheduled, confirmed, cancelled, completed), próg confidence = 40

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|------|-------|--------|
| `app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx` | MODIFY | codex-main |
| `lib/booksy/booking-match.ts` | MODIFY | codex-main |
| `components/dashboard/booksy-status-widget.tsx` | MODIFY | codex-dad |
| `app/api/internal/booksy/manual-review/route.ts` | CREATE | codex-dad |
| `lib/booksy/email-parser.ts` | MODIFY | codex-dad |

> **Dispatch:** codex-main (page.tsx + booking-match.ts) równolegle z codex-dad (status-widget.tsx + manual-review/route.ts + email-parser.ts). Pliki nie nakładają się.

## Zależności
Wymaga: B2-13 (review_reason + candidate_bookings w DB i kodzie)  
Blokuje: B2-15  
Parallel z: nic (page.tsx i booking-match.ts to dwa oddzielne pliki bez race condition)

## Prompt — codex-main (page.tsx + booking-match.ts)
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Do NOT use Gemini — write directly.
Goal: Add Manual Review tab to Booksy settings page + forwarded-email loose matching in booking-match.
Files:
- app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx (MODIFY — add tab)
- lib/booksy/booking-match.ts (MODIFY — forwarded email path)

Changes in page.tsx:
- Add tab "Do przejrzenia" next to existing tabs. Fetch GET /api/internal/booksy/manual-review?salonId=[slug].
- Display each event as a card: event_type badge (created/cancelled/rescheduled), review_reason badge, client name from payload.parsed.clientName, service from payload.parsed.serviceName, new date from payload.parsed.bookingDate+bookingTime.
- If candidate_bookings has items: show radio selector listing each candidate (appointmentDate, startTime, clientName, serviceName).
- Buttons: "Zatwierdź" (POST /api/internal/booksy/repair with parsedEventId + selected bookingId), "Odrzuć" (PATCH /api/internal/booksy/manual-review with parsedEventId, action: discard).
- Show count badge on tab when count > 0.
- Use shadcn/ui components (Card, Badge, Button, RadioGroup) — import individually, not from barrel.

Changes in booking-match.ts:
- Add optional param `isForwarded?: boolean` to findCancellationMatch and findRescheduleMatch.
- When isForwarded=true: extend appointment search to include status IN (cancelled, completed, scheduled, confirmed). Minimum confidence threshold = 40 instead of 60.
- Caller (processor.ts) will pass isForwarded when payload.source === "forwarded".
Constraints: Use for...of with entries() instead of index loops. Do not change existing export signatures — add optional params only.
Done when: npx tsc --noEmit reports no new errors.'
```

## Prompt — codex-dad (booksy-status-widget.tsx + manual-review/route.ts + email-parser.ts)
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it. Read /mnt/d/SimpliSalonCLoud/components/dashboard/booksy-status-widget.tsx and /mnt/d/SimpliSalonCLoud/lib/booksy/email-parser.ts and /mnt/d/SimpliSalonCLoud/app/api/internal/booksy/repair/route.ts for context on patterns.
Goal: Add manual_review alert to dashboard widget + create manual-review API route + forwarded email detection in parser.
Files:
- /mnt/d/SimpliSalonCLoud/components/dashboard/booksy-status-widget.tsx (MODIFY)
- /mnt/d/SimpliSalonCLoud/app/api/internal/booksy/manual-review/route.ts (CREATE)
- /mnt/d/SimpliSalonCLoud/lib/booksy/email-parser.ts (MODIFY)

booksy-status-widget.tsx changes:
- Add query: count booksy_parsed_events WHERE status = "manual_review" AND salon_id = salonId (use adminSupabase, head:true count).
- If manualReviewCount > 0: render an alert section below existing stats — amber/orange styling, text "X rezerwacji wymaga przejrzenia", Link to /${salonSlug}/settings/integrations/booksy?tab=review (use Next.js Link). Include AlertTriangle icon from lucide-react.
- If count = 0: render nothing extra (no change to existing UI).

manual-review/route.ts (CREATE):
- GET: auth via getAuthContext(), query booksy_parsed_events WHERE status = "manual_review" AND salon_id = salonId. Return array of { id, event_type, review_reason, review_detail, candidate_bookings, parsed: payload->parsed, created_at }.
- PATCH: body { parsedEventId: string, action: "discard" }. Update booksy_parsed_events SET status = "discarded" WHERE id = parsedEventId AND salon_id = salonId. Return { success: true }.
- Auth: session via getAuthContext() from lib/supabase/get-auth-context.ts — this is a user-facing route, no CRON_SECRET.

email-parser.ts changes:
- After parsing subject and fromAddress: detect forwarded if subject.match(/^(fwd?|fw):/i) OR fromAddress does not include "booksy.com".
- If forwarded: set source = "forwarded" in the returned payload object.
- Keep all existing parsing logic unchanged — this is additive only.
Constraints: Do not break existing exports. Use for...of with entries() instead of index loops. salon_id always from getAuthContext, never from request body.
Done when: npx tsc --noEmit clean.' bash ~/.claude/scripts/dad-exec.sh
```

## Po sprincie — OBOWIĄZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
# Verify: page.tsx has "Do przejrzenia" tab
# Verify: booksy-status-widget.tsx has manualReviewCount query + AlertTriangle link
# Verify: grep for "forwarded" in email-parser.ts
# Verify: grep for "isForwarded" in booking-match.ts
```
