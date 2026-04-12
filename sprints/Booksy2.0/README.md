# Booksy 2.0 — Sprint Map

## Wave diagram

```text
Wave 0 │ B2-00  cleanup-dead-code
Wave 1 │ B2-01  db-gmail-accounts
Wave 2 │ B2-02  db-raw-email-ledger
Wave 3 │ B2-03  oauth-onboarding-refactor  ‖  B2-05  db-watch-tables
Wave 4 │ B2-04  raw-ingest-existing-path   ‖  B2-06  gmail-watch-lifecycle
Wave 5 │ B2-07  catchup-worker             ‖  B2-08  parse-apply-workers
Wave 6 │ B2-09  cron-refactor
Wave 7 │ B2-10  reconciliation             ‖  B2-11  health-alerting
Wave 8 │ B2-12  multi-mailbox-ui
```

Sprints w tej samej Wave mozna robic jednoczesnie (parallel dispatch).
Arch doc: docs/architecture/booksy-option-b-implementation.md

## Sprint index

| Sprint | Plik | Faza | Parallel z |
|--------|------|------|-----------|
| B2-00 | sprint-B2-00-cleanup.md | Pre | — |
| B2-01 | sprint-B2-01-db-gmail-accounts.md | 0.5 | — |
| B2-02 | sprint-B2-02-db-raw-email-ledger.md | 1 | — |
| B2-03 | sprint-B2-03-oauth-onboarding.md | 1 | B2-05 |
| B2-04 | sprint-B2-04-raw-ingest-path.md | 1 | B2-06 |
| B2-05 | sprint-B2-05-db-watch-tables.md | 2 | B2-03 |
| B2-06 | sprint-B2-06-watch-lifecycle.md | 2 | B2-04 |
| B2-07 | sprint-B2-07-catchup-worker.md | 2 | B2-08 |
| B2-08 | sprint-B2-08-parse-apply-workers.md | 2 | B2-07 |
| B2-09 | sprint-B2-09-cron-refactor.md | 2 | — |
| B2-10 | sprint-B2-10-reconciliation.md | 3 | B2-11 |
| B2-11 | sprint-B2-11-health-alerting.md | 3 | B2-10 |
| B2-12 | sprint-B2-12-multi-mailbox-ui.md | 3 | — |
