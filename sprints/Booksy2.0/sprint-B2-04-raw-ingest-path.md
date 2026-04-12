# Sprint B2-04 — raw-ingest-existing-path
## Cel
Mostek między starym flow sync/cron a nowym ledgerem: zapisz raw email do `booksy_raw_emails`, rozdziel parser na parse + apply bez zmiany publicznego interfejsu procesora.

## Faza + Wave (Wave 4 — Parallel z: B2-06)
Faza 1, Wave 4.

## Architektura — dokumenty referencyjne (dad reader command for relevant arch doc)
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract architecture constraints for B2-04 raw ingest bridge, parser split parse/apply, feature flag fallback. FORMAT: bullet list with file anchors.' bash ~/.claude/scripts/dad-exec.sh
```

## Zakres (checkbox list of what to build)
- [ ] Dodać zapis raw maili do `booksy_raw_emails` w ścieżce polling (`ingest_source='polling_fallback'`).
- [ ] Zwracać `booksy_raw_email.id` do dalszego procesu.
- [ ] W `processor.ts` rozdzielić parse i apply: parse zapisuje do `booksy_parsed_events` (`status='pending'`).
- [ ] Dodać `applyParsedEvent()` zapisujący do `booksy_apply_ledger`.
- [ ] Zachować istniejącą logikę parsowania i interfejs `BooksyProcessor.processEmail()`.
- [ ] Dodać fallback: gdy `BOOKSY_LEDGER_ENABLED=false`, zachować stary flow.
- [ ] Gdy insert do `booksy_raw_emails` się nie powiedzie: log + kontynuacja, bez blokowania flow.

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|---|---|---|
| `lib/booksy/gmail-client.ts` | MODIFY | codex-main |
| `lib/booksy/processor.ts` | MODIFY | codex-dad |

## Zaleznosci (Wymaga: / Blokuje: / Parallel z:)
Wymaga: B2-02, B2-03  
Blokuje: B2-08  
Parallel z: B2-06

## Prompt — codex-main + codex-dad (raw ingest + processor split bridge)
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Read d:/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement B2-04. Modify d:/SimpliSalonCLoud/lib/booksy/gmail-client.ts to insert Gmail messages into booksy_raw_emails with ingest_source=polling_fallback and return raw_email_id. Modify d:/SimpliSalonCLoud/lib/booksy/processor.ts to keep processEmail() interface unchanged, write parsed events to booksy_parsed_events with pending status, and add applyParsedEvent() writing to booksy_apply_ledger. Preserve existing parsing behavior. If BOOKSY_LEDGER_ENABLED=false keep legacy flow. If raw insert fails log and continue. Run npx tsc --noEmit and report files changed + open issues.'
```
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it. Read /mnt/d/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement only processor split scope for B2-04. Modify /mnt/d/SimpliSalonCLoud/lib/booksy/processor.ts: keep processEmail() external contract unchanged, persist parsed payload to booksy_parsed_events status=pending, and add applyParsedEvent() writing idempotent records to booksy_apply_ledger while preserving current parser behavior and BOOKSY_LEDGER_ENABLED fallback.' bash ~/.claude/scripts/dad-exec.sh
```

## Po sprincie — OBOWIAZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
```
