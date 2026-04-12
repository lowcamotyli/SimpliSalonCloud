# Sprint B2-11 — health-alerting
## Cel
Dodać health metrics per mailbox i endpoint integracyjny dla UI z regułami `ok/warning/critical`.

## Faza + Wave (Wave 7 — Parallel z: B2-10)
Faza 3, Wave 7.

## Architektura — dokumenty referencyjne (dad reader command for relevant arch doc)
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract health model and alert thresholds for B2-11 mailbox monitoring. FORMAT: field mapping + threshold rules.' bash ~/.claude/scripts/dad-exec.sh
```

## Zakres (checkbox list of what to build)
- [ ] Dodać `lib/booksy/health-check.ts` z `getMailboxHealth` i `getSalonHealth`.
- [ ] Zwracać wszystkie pola MailboxHealth: auth/watch/expiry/notification/backlog/failure/manual queue/apply failures/reconciliation missing.
- [ ] Reguła `critical`: auth revoked/expired lub watch wygasa <1h lub brak notyfikacji >30 min (w godzinach pracy).
- [ ] Reguła `warning`: watch wygasa <12h lub `parseFailureRate > 0.1`.
- [ ] Dodać endpoint `GET /api/integrations/booksy/health` dla zalogowanego salonu.

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|---|---|---|
| `lib/booksy/health-check.ts` | CREATE | codex-dad |
| `app/api/integrations/booksy/health/route.ts` | CREATE | codex-main |

## Zaleznosci (Wymaga: / Blokuje: / Parallel z:)
Wymaga: B2-09  
Blokuje: B2-12  
Parallel z: B2-10

## Prompt — codex-main + codex-dad (health endpoint + health lib)
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Read d:/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement B2-11. Create d:/SimpliSalonCLoud/lib/booksy/health-check.ts with getMailboxHealth(accountId, supabase) and getSalonHealth(salonId, supabase), returning required MailboxHealth fields. Implement overall logic: critical for auth revoked/expired OR watch expiry <1h OR last notification older than 30min during business hours; warning for watch expiry <12h OR parseFailureRate > 0.1. Create d:/SimpliSalonCLoud/app/api/integrations/booksy/health/route.ts GET endpoint returning getSalonHealth() for authenticated salon. Run npx tsc --noEmit and report evidence.'
```
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it. Read /mnt/d/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement only health library scope for B2-11. Create /mnt/d/SimpliSalonCLoud/lib/booksy/health-check.ts with getMailboxHealth(accountId,supabase) and getSalonHealth(salonId,supabase), MailboxHealth fields from spec, and overall state rules for critical/warning thresholds.' bash ~/.claude/scripts/dad-exec.sh
```

## Po sprincie — OBOWIAZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
```
