# Sprint B2-05 — db-watch-tables
## Cel
Dodać tabele Gmail Watch (`booksy_gmail_watches`, `booksy_gmail_notifications`) oraz `booksy_reconciliation_runs` z pełnym RLS po `salon_id`.

## Faza + Wave (Wave 3 — Parallel z: B2-03)
Faza 2, Wave 3.

## Architektura — dokumenty referencyjne (dad reader command for relevant arch doc)
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract DB design and RLS constraints for Gmail watch notifications and reconciliation tables (B2-05). FORMAT: bullet list with migration checklist.' bash ~/.claude/scripts/dad-exec.sh
```

## Zakres (checkbox list of what to build)
- [ ] Utworzyć migrację `supabase/migrations/20260420000003_booksy_watch_tables.sql`.
- [ ] Dodać `booksy_gmail_watches` zgodnie ze spec.
- [ ] Dodać `booksy_gmail_notifications` zgodnie ze spec.
- [ ] Dodać `booksy_reconciliation_runs` zgodnie ze spec.
- [ ] Dodać RLS na wszystkich nowych tabelach: `salon_id = get_user_salon_id()`.
- [ ] Upewnić się, że constrainty, defaulty i enum/check values są zgodne ze spec.

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|---|---|---|
| `supabase/migrations/20260420000003_booksy_watch_tables.sql` | CREATE | codex-dad |

## Zaleznosci (Wymaga: / Blokuje: / Parallel z:)
Wymaga: B2-02  
Blokuje: B2-06, B2-07  
Parallel z: B2-03

## Prompt — codex-dad (SQL migration for watch tables)
```bash
DAD_PROMPT='Read .workflow/skills/sql-migration-safe.md and follow it. Read /mnt/d/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement B2-05 exactly. Create /mnt/d/SimpliSalonCLoud/supabase/migrations/20260420000003_booksy_watch_tables.sql with tables booksy_gmail_watches, booksy_gmail_notifications, booksy_reconciliation_runs and all columns/defaults/checks/uniques from spec. Add RLS policies requiring salon_id = get_user_salon_id() for tenant-scoped access. Keep migration idempotency-safe style used in repo. Return changed files + verification notes.' bash ~/.claude/scripts/dad-exec.sh
```

## Po sprincie — OBOWIAZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
```
