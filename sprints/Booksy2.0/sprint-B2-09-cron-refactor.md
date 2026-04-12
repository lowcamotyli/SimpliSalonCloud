# Sprint B2-09 — cron-refactor
## Cel
Przełączyć cron z flow search-based na watch+catchup+parse+apply z feature flagiem jako circuit breaker i bezpiecznym fallbackiem.

## Faza + Wave (Wave 6 — Parallel z: Brak)
Faza 2, Wave 6.

## Architektura — dokumenty referencyjne (dad reader command for relevant arch doc)
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract cron orchestration sequence and fallback strategy for B2-09. FORMAT: ordered execution plan with failure handling notes.' bash ~/.claude/scripts/dad-exec.sh
```

## Zakres (checkbox list of what to build)
- [ ] Zmodyfikować `app/api/cron/booksy/route.ts`.
- [ ] Gdy `BOOKSY_USE_WATCH=true`: uruchamiać sekwencję process-notifications -> parse -> apply.
- [ ] Dodać odnowienie watchy wygasających w ciągu 12h przez endpoint watch.
- [ ] Internal endpoint calls muszą wysyłać `CRON_SECRET` header.
- [ ] Gdy `BOOKSY_USE_WATCH=false`: zachować stary flow search-based bez zmian.
- [ ] Zapewnić rollback bez deployu przez sam feature flag.

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|---|---|---|
| `app/api/cron/booksy/route.ts` | MODIFY | codex-main |

## Zaleznosci (Wymaga: / Blokuje: / Parallel z:)
Wymaga: B2-07, B2-08  
Blokuje: B2-10, B2-11  
Parallel z: Brak

## Prompt — codex-main (cron orchestrator refactor)
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Read d:/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement B2-09 in d:/SimpliSalonCLoud/app/api/cron/booksy/route.ts. If BOOKSY_USE_WATCH=true run pipeline in order: POST /api/internal/booksy/process-notifications, POST /api/internal/booksy/parse, POST /api/internal/booksy/apply, then renew watches expiring within 12h via POST /api/integrations/booksy/watch. All internal endpoint calls must include CRON_SECRET header. If BOOKSY_USE_WATCH=false keep legacy search-based flow unchanged. Preserve circuit-breaker behavior for fast rollback without deploy. Run npx tsc --noEmit and report evidence.'
```

## Po sprincie — OBOWIAZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
```
