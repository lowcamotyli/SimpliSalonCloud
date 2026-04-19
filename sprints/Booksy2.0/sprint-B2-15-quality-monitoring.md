# Sprint B2-15 — quality + monitoring

## Cel
1. Structured error codes — zastąpić regex-based retry policy typowanymi klasami błędów
2. Monitoring — alert przy manual_review > próg, dzienny digest do właściciela

## Faza + Wave (Wave 11 — Sequential po B2-14)
Faza 4, Wave 11.

## Architektura — dokumenty referencyjne
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract health-check design, alerting thresholds, and any notification channels already in use for Booksy. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

### Kluczowe constraints
- Structured errors: dodaj `lib/booksy/errors.ts` z custom Error subclasses — `BookingNotFoundError`, `AmbiguousMatchError`, `ServiceNotFoundError`, `EmployeeNotFoundError`, `ValidationError`
- `retry-policy.ts`: sprawdzaj `error instanceof X` zamiast `message.match(regex)` — zachowaj regex jako fallback dla niezmigrowanych call site
- Monitoring: health-check (`lib/booksy/health-check.ts`) już zwraca `failedNotifications` — dodaj `manualReviewCount` + `manualReviewStale` (eventy starsze niż 24h w manual_review)
- Alert próg: `manualReviewStale > 3` → log WARN (nie blokuj flow — to dane dla dashboardu)
- Dzienny digest: istniejący CRON (`app/api/cron/booksy/route.ts`) — dodaj opcjonalny krok "summarize day" wysyłający log z licznikami (applied, manual_review, discarded) do structured logger. Nie wysyłamy emaila — samo logowanie do Supabase.

## Zakres
- [ ] **`lib/booksy/errors.ts`** — CREATE: custom Error subclasses z `code` property
- [ ] **`lib/booksy/retry-policy.ts`** — MODIFY: `instanceof` checks + regex fallback
- [ ] **`lib/booksy/processor.ts`** — MODIFY: throw typed errors zamiast `new Error("string")`
- [ ] **`lib/booksy/health-check.ts`** — MODIFY: dodaj `manualReviewCount`, `manualReviewStale` (count > 24h), log WARN gdy stale > 3
- [ ] **`app/api/cron/booksy/route.ts`** — MODIFY: dodaj daily digest log (applied/manual_review/discarded counts per salon_id)

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|------|-------|--------|
| `lib/booksy/errors.ts` | CREATE | codex-main |
| `lib/booksy/retry-policy.ts` | MODIFY | codex-main |
| `lib/booksy/processor.ts` | MODIFY | codex-dad |
| `lib/booksy/health-check.ts` | MODIFY | codex-dad |
| `app/api/cron/booksy/route.ts` | MODIFY | codex-dad |

> **Dispatch:** codex-main (errors.ts + retry-policy.ts) równolegle z codex-dad (health-check.ts + cron route.ts). processor.ts jest zależny od errors.ts → codex-dad dostaje processor.ts dopiero po zakończeniu codex-main.

## Zależności
Wymaga: B2-14  
Blokuje: nic (last sprint)  
Parallel z: nic

## Prompt — codex-main (errors.ts + retry-policy.ts) [faza 1]
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Read lib/booksy/retry-policy.ts for full context. Do NOT use Gemini — write directly.
Goal: Create typed error classes and update retry policy to use instanceof checks.
Files:
- lib/booksy/errors.ts (CREATE)
- lib/booksy/retry-policy.ts (MODIFY)

errors.ts — create with these classes (each extends Error, sets name, has readonly code: string):
  - BookingNotFoundError: code = "booking_not_found"
  - AmbiguousMatchError: code = "ambiguous_match", constructor also accepts candidates?: unknown[]
  - ServiceNotFoundError: code = "service_not_found"
  - EmployeeNotFoundError: code = "employee_not_found"
  - ValidationError: code = "validation"
  - BookingAlreadyAppliedError: code = "already_applied"
Export all. Export type BooksyErrorCode = union of all code strings.

retry-policy.ts changes:
- Import the error classes from ./errors.
- In classifyBooksyFailure: first check instanceof (BookingNotFoundError → cancel_not_found permanent, AmbiguousMatchError → ambiguous_match permanent, ServiceNotFoundError → service_not_found permanent, EmployeeNotFoundError → employee_not_found permanent, ValidationError → validation permanent, BookingAlreadyAppliedError → already_applied permanent).
- Fall through to existing regex logic for unknown Error types (backward compat).
- unknown error: change retryable from false to true, cap implied by caller (fail-safe).
Constraints: Do not remove existing regex patterns. Export classifyBooksyFailure and isRetryableBooksyFailure unchanged.
Done when: npx tsc --noEmit clean.'
```

## Prompt — codex-dad (health-check.ts + cron route.ts) [faza 1, równolegle z codex-main]
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it. Read /mnt/d/SimpliSalonCLoud/lib/booksy/health-check.ts and /mnt/d/SimpliSalonCLoud/app/api/cron/booksy/route.ts for full context.
Goal: Add manual_review monitoring to health-check + daily digest logging to cron.
Files:
- /mnt/d/SimpliSalonCLoud/lib/booksy/health-check.ts (MODIFY)
- /mnt/d/SimpliSalonCLoud/app/api/cron/booksy/route.ts (MODIFY)

health-check.ts changes:
- Add to health check result: manualReviewCount (total manual_review events for this salon), manualReviewStale (count of manual_review events older than 24h).
- Query: SELECT COUNT(*) from booksy_parsed_events WHERE status = manual_review AND salon_id = salonId; and same with AND created_at < now()-24h for stale.
- If manualReviewStale > 3: logger.warn with structured context { salonId, staleCount }.
- Add manualReviewCount and manualReviewStale to returned health object.

cron/booksy/route.ts changes:
- Once per day (check if current UTC hour === 23 OR use a date-keyed flag in the run): log daily digest as structured info log: { event: "booksy_daily_digest", salonId, counts: { applied, manual_review, discarded }, date: today ISO }.
- Query booksy_parsed_events WHERE created_at >= today 00:00 UTC AND salon_id IN active salons, GROUP BY status.
- Do not send email or SMS — structured log only.
Constraints: Do not change existing health-check return type shape — only add new fields. Do not block cron on digest failure (wrap in try/catch). Use for...of with entries() instead of index loops.
Done when: npx tsc --noEmit clean.' bash ~/.claude/scripts/dad-exec.sh
```

## Prompt — codex-dad (processor.ts) [faza 2 — PO zakończeniu codex-main]
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it. Read /mnt/d/SimpliSalonCLoud/lib/booksy/errors.ts (just created) and first 150 lines of /mnt/d/SimpliSalonCLoud/lib/booksy/processor.ts for context.
Goal: Replace generic Error throws in processor.ts with typed error classes from errors.ts.
File: /mnt/d/SimpliSalonCLoud/lib/booksy/processor.ts
Changes:
- Import BookingNotFoundError, AmbiguousMatchError, ServiceNotFoundError, EmployeeNotFoundError, ValidationError, BookingAlreadyAppliedError from ./errors.
- Replace: throw new Error("Employee not found...") → throw new EmployeeNotFoundError(...)
- Replace: throw new Error("Service not found...") → throw new ServiceNotFoundError(...)
- Replace: throw new Error("Zmiana na inny termin...") → throw new ValidationError(...)
- Replace: cancel_not_found path → throw new BookingNotFoundError(...)
- Replace: ambiguous match path → throw new AmbiguousMatchError(message, candidates)
- Keep all other logic, auth, and salon_id filtering UNCHANGED.
Constraints: Do not change function signatures. Do not remove any existing logic. Use for...of with entries() instead of index loops.
Done when: npx tsc --noEmit clean.' bash ~/.claude/scripts/dad-exec.sh
```

## Po sprincie — OBOWIĄZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
# Verify: lib/booksy/errors.ts exists with all 6 classes
# Verify: grep for "instanceof BookingNotFoundError" in retry-policy.ts
# Verify: grep for "manualReviewCount" in health-check.ts
```
