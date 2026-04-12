# Sprint B2-10 — reconciliation
## Cel
Dodać rolling reconciliation 14 dni: wykrywanie brakujących emaili i backfill do ledgera, z izolacją błędów per mailbox.

## Faza + Wave (Wave 7 — Parallel z: B2-11)
Faza 3, Wave 7.

## Architektura — dokumenty referencyjne (dad reader command for relevant arch doc)
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract reconciliation design for 14-day rolling window, run accounting, and cron cadence (B2-10). FORMAT: execution checklist.' bash ~/.claude/scripts/dad-exec.sh
```

## Zakres (checkbox list of what to build)
- [ ] Dodać `POST /api/internal/booksy/reconcile` (internal, wymaga `CRON_SECRET` header).
- [ ] Dla każdego aktywnego mailbox: start run w `booksy_reconciliation_runs` ze statusem `running` i oknem `now()-14d -> now()`.
- [ ] Pobierać Gmail `messages.list` dla `from:noreply@booksy.com` i okna czasu.
- [ ] Porównać `gmail_message_id` z `booksy_raw_emails`.
- [ ] Brakujące emaile backfillować do `booksy_raw_emails` z `ingest_source='reconciliation'`.
- [ ] Aktualizować run status na `completed` z licznikami.
- [ ] Awaria jednej skrzynki nie może blokować pozostałych.
- [ ] Dodać wywołanie reconcile raz dziennie w cron route.

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|---|---|---|
| `app/api/internal/booksy/reconcile/route.ts` | CREATE | codex-main |
| `app/api/cron/booksy/route.ts` | MODIFY | codex-main |

## Zaleznosci (Wymaga: / Blokuje: / Parallel z:)
Wymaga: B2-09  
Blokuje: B2-12  
Parallel z: B2-11

## Prompt — codex-main (reconciliation worker + daily cron)
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Read d:/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement B2-10. Create d:/SimpliSalonCLoud/app/api/internal/booksy/reconcile/route.ts as internal endpoint requiring CRON_SECRET header. For each active mailbox create reconciliation run (14-day window, status running), query Gmail messages.list with from:noreply@booksy.com and after window start, compare gmail_message_ids against booksy_raw_emails, backfill missing rows into booksy_raw_emails with ingest_source=reconciliation, then update run status/counters/completed_at. Isolate failures per mailbox. Modify d:/SimpliSalonCLoud/app/api/cron/booksy/route.ts to call reconcile once daily (time gate or counter). Run npx tsc --noEmit and report evidence.'
```

## Po sprincie — OBOWIAZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
```
