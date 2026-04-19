# Sprint B2-13 — match-repair (backend core)

## Cel
Naprawić główne przypadki zablokowanych eventów:
1. `rescheduled` z `oldDate=unknown` — fuzzy match po nowej dacie + kliencie + usłudze
2. `cancelled` bez dopasowania — discard → manual_review z `review_reason: cancel_not_found`
3. Wypchnąć lokalną migrację `20260425000001_booksy_manual_review_metadata.sql` na PROD branch

## Faza + Wave (Wave 9 — Parallel z: nic, blokuje B2-14)
Faza 4, Wave 9.

## Architektura — dokumenty referencyjne
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract matching strategy for reschedule and cancel flows, any constraints on manual_review status transitions, and candidate_bookings schema. FORMAT: Bulleted list. Do NOT summarize away exceptions.' bash ~/.claude/scripts/dad-exec.sh
```

### Kluczowe constraints (z analizy PROD)
- 6 `rescheduled` events mają `oldDate: "unknown"` — subject "zmienił rezerwację i czeka na potwierdzenie" nie zawiera starego terminu
- `findRescheduleMatch` (booking-match.ts) musi obsłużyć brak oldDate: szukaj future bookings po `clientName` + `serviceName` w oknie 90 dni
  - 1 kandydat → match kind `single_future` → apply normalnie
  - 0 lub >1 → kind `ambiguous` / `none` → manual_review z `candidate_bookings` uzupełnionymi
- 5 `cancelled` z `discarded` ma pełne dane — nie ma bookingu w DB (pre-integracja)
  - Zmienić: `cancel_not_found` → status `manual_review`, `review_reason: 'cancel_not_found'` zamiast `discarded`
- `candidate_bookings` JSONB: tablica `{ id, appointmentDate, startTime, clientName, serviceName, score }`
- `review_reason` TEXT: wartości z enum `'ambiguous_match' | 'cancel_not_found' | 'validation' | 'unknown'`

## Zakres
- [ ] **`lib/booksy/booking-match.ts`** — `findRescheduleMatch`: gdy oldDate=unknown, fallback do future-search po clientName+serviceName (okno 90 dni od `now()`). Zwróć `single_future` (1 wynik) lub `ambiguous` / `none` jak dotychczas.
- [ ] **`lib/booksy/processor.ts`** — obsługa nowego kind `single_future` → apply jak `exact`. Przy `cancel_not_found`: zamiast discard → manual_review z `review_reason`.
- [ ] **`lib/booksy/processor.ts`** — przy przejściu w `manual_review`: uzupełnij `review_reason`, `review_detail`, `candidate_bookings` w `booksy_parsed_events`.
- [ ] **`lib/booksy/retry-policy.ts`** — dodaj `cancel_not_found` do permanent (non-retryable) failure codes.

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|------|-------|--------|
| `lib/booksy/booking-match.ts` | MODIFY | codex-main |
| `lib/booksy/processor.ts` | MODIFY | codex-dad |
| `lib/booksy/retry-policy.ts` | MODIFY | codex-dad |

## Zależności
Wymaga: B2-12 (done), migracja 20260425000001 na gałęzi  
Blokuje: B2-14 (UI manual review wymaga tych kolumn i wartości)  
Parallel z: nic

## Prompt — codex-main (booking-match.ts)
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Read lib/booksy/booking-match.ts for full context. Do NOT use Gemini — write directly.
Goal: Extend findRescheduleMatch to handle oldDate=unknown via future-booking fallback.
File: lib/booksy/booking-match.ts
Changes:
- When oldDate === "unknown" or oldTime === "unknown": query appointments table for this salonId where status IN (scheduled, confirmed) AND start_time >= now() AND start_time <= now()+90days, matching by clientName (fuzzy, normalize diacritics+lowercase) AND serviceName (fuzzy, normalize).
- If exactly 1 result: return { kind: "single_future", match: appointment, score: 70, candidates: [appointment] }
- If 0 results: return { kind: "none", candidates: [] }
- If >1 results: return { kind: "ambiguous", candidates: top5ByScore }
- Keep existing logic (exact date match path) unchanged when oldDate is known.
- candidate_bookings shape: { id, appointmentDate (YYYY-MM-DD), startTime (HH:mm), clientName, serviceName, score }
Constraints: Do not change findCancellationMatch or any other exports. Use for...of with entries() instead of index-based loops (noUncheckedIndexedAccess).
Done when: npx tsc --noEmit reports no new errors in this file.'
```

## Prompt — codex-dad (processor.ts + retry-policy.ts)
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it. Read /mnt/d/SimpliSalonCLoud/lib/booksy/processor.ts (first 200 lines for context, then search for cancel and manual_review handling). Read /mnt/d/SimpliSalonCLoud/lib/booksy/retry-policy.ts.
Goal: Wire new match kinds + cancel_not_found into processor and retry policy.
Files:
- /mnt/d/SimpliSalonCLoud/lib/booksy/processor.ts
- /mnt/d/SimpliSalonCLoud/lib/booksy/retry-policy.ts
Changes in processor.ts:
1. After calling findRescheduleMatch: handle kind === "single_future" same as kind === "exact" (apply the reschedule).
2. When transitioning to manual_review: update booksy_parsed_events SET review_reason, review_detail, candidate_bookings using the match result. review_reason values: "ambiguous_match" (reschedule ambiguous/none), "cancel_not_found" (cancelled booking not found), "validation" (existing), "unknown" (existing).
3. findCancellationMatch returning kind === "none": instead of discarding, set status = "manual_review", review_reason = "cancel_not_found", review_detail = "Wizyta nie znaleziona w systemie (prawdopodobnie sprzed integracji)", candidate_bookings = [].
Changes in retry-policy.ts:
- Add "cancel_not_found" to permanent (non-retryable) failure codes list alongside existing cancel_not_found-like patterns.
Constraints: Do not change function signatures, do not touch auth or salon_id filtering. Use for...of with entries() instead of index-based loops.
Done when: npx tsc --noEmit clean.' bash ~/.claude/scripts/dad-exec.sh
```

## Po sprincie — OBOWIĄZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
# Verify: grep for "single_future" in booking-match.ts
# Verify: grep for "cancel_not_found" in processor.ts and retry-policy.ts
```
