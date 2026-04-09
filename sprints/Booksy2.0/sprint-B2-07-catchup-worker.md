# Sprint B2-07 — catchup-worker
## Cel
Zbudować worker przetwarzający notyfikacje Gmail History API: idempotentny, lockowany per mailbox, odporny na awarie pojedynczych skrzynek.

## Faza + Wave (Wave 5 — Parallel z: B2-08)
Faza 2, Wave 5.

## Architektura — dokumenty referencyjne (dad reader command for relevant arch doc)
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract catchup-worker flow for Gmail history with mailbox-level locking and failure isolation (B2-07). FORMAT: step-by-step checklist.' bash ~/.claude/scripts/dad-exec.sh
```

## Zakres (checkbox list of what to build)
- [ ] Dodać `POST /api/internal/booksy/process-notifications` (endpoint wewnętrzny).
- [ ] Endpoint musi wymagać `CRON_SECRET` header (internal-only).
- [ ] Pobierać pending notyfikacje i lockować watch `FOR UPDATE SKIP LOCKED` z `lock_timeout='5s'`.
- [ ] Dla lock conflict: pominąć mailbox (`SKIP LOCKED`).
- [ ] Wywołać Gmail History API od `last_history_id`.
- [ ] Przy 404 z History API: ustawić `needs_full_sync=true` i pominąć dalszy processing.
- [ ] Dla nowych wiadomości: INSERT do `booksy_raw_emails` (`ON CONFLICT DO NOTHING`) i zapis MIME do bucketu `booksy-raw-emails`.
- [ ] Aktualizować `booksy_gmail_watches` (`last_history_id`, `last_sync_at`) i `booksy_gmail_notifications` (`processed`).
- [ ] Awaria jednej skrzynki nie może blokować pozostałych.

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|---|---|---|
| `app/api/internal/booksy/process-notifications/route.ts` | CREATE | codex-main |

## Zaleznosci (Wymaga: / Blokuje: / Parallel z:)
Wymaga: B2-06, B2-02  
Blokuje: B2-09  
Parallel z: B2-08

## Prompt — codex-main (catchup worker internal endpoint)
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Read d:/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement B2-07. Create d:/SimpliSalonCLoud/app/api/internal/booksy/process-notifications/route.ts. This is an internal endpoint and requires CRON_SECRET header. Process pending booksy_gmail_notifications with mailbox isolation: lock matching booksy_gmail_watches row FOR UPDATE SKIP LOCKED using lock_timeout=5s, skip locked mailboxes, call Gmail history.list(startHistoryId=last_history_id), handle 404 by setting needs_full_sync=true, insert discovered messages into booksy_raw_emails ON CONFLICT DO NOTHING, store MIME into Supabase Storage bucket booksy-raw-emails, update watch cursor/sync timestamps, mark notifications processed. Ensure per-mailbox try/catch so one failure does not block others. Run npx tsc --noEmit and report evidence.'
```

## Po sprincie — OBOWIAZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
```
