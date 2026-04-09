# Sprint B2-08 — parse-apply-workers
## Cel
Dodać parser i apply jako osobne workery z fingerprint SHA256, confidence thresholdami i idempotency ledgerem.

## Faza + Wave (Wave 5 — Parallel z: B2-07)
Faza 2, Wave 5.

## Architektura — dokumenty referencyjne (dad reader command for relevant arch doc)
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract parse/apply split design, fingerprint normalization rules, and idempotency model for B2-08. FORMAT: bullet checklist with formulas.' bash ~/.claude/scripts/dad-exec.sh
```

## Zakres (checkbox list of what to build)
- [ ] Dodać `lib/booksy/fingerprint.ts` z `computeFingerprint(...)` opartym o SHA256 i normalizację.
- [ ] `normalizeContact`: lowercase/trim, preferuj email nad phone.
- [ ] `normalizeServiceName`: lowercase/trim, usuń diakrytyki PL i skróty `ul.`/`dl.`/`kr.`.
- [ ] `truncateTo15min` dla tolerancji ±15 min.
- [ ] Dodać `POST /api/internal/booksy/parse` (internal, `CRON_SECRET` header).
- [ ] Parse worker: pobierz `booksy_raw_emails` pending, pobierz MIME ze Storage, parsuj istniejącą logiką, licz confidence/trust, insert parsed events z `ON CONFLICT event_fingerprint DO NOTHING`, oznacz raw jako parsed.
- [ ] Dodać `POST /api/internal/booksy/apply` (internal, `CRON_SECRET` header).
- [ ] Apply worker: thresholdy confidence, manual_review/discarded, auto-apply z `idempotency_key=SHA256(salon_id+event_fingerprint)`, ledger `ON CONFLICT DO NOTHING`, update booking + status applied.

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|---|---|---|
| `lib/booksy/fingerprint.ts` | CREATE | codex-dad |
| `app/api/internal/booksy/parse/route.ts` | CREATE | codex-main |
| `app/api/internal/booksy/apply/route.ts` | CREATE | codex-main |

## Zaleznosci (Wymaga: / Blokuje: / Parallel z:)
Wymaga: B2-04, B2-06  
Blokuje: B2-09  
Parallel z: B2-07

## Prompt — codex-main + codex-dad (parse/apply workers + fingerprint)
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Read d:/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement B2-08. Create d:/SimpliSalonCLoud/lib/booksy/fingerprint.ts implementing computeFingerprint with SHA256(salonId + eventType + normalizeContact + normalizeServiceName + truncateTo15min(startAtUtc)); contact normalization prefers email over phone; service normalization lowercases, trims, strips Polish diacritics and ul./dl./kr. Create d:/SimpliSalonCLoud/app/api/internal/booksy/parse/route.ts and d:/SimpliSalonCLoud/app/api/internal/booksy/apply/route.ts. Both are internal endpoints and require CRON_SECRET header. Parse route loads pending raw emails, fetches MIME from storage, uses existing processor parse logic, computes confidence/trust/fingerprint, inserts booksy_parsed_events ON CONFLICT event_fingerprint DO NOTHING, marks raw parsed. Apply route enforces thresholds: >=0.85 auto-apply, >=0.92 for cancelled/rescheduled, 0.50-0.85 manual_review, <0.50 discarded; uses idempotency ledger with SHA256(salon_id + event_fingerprint), applies booking changes only when ledger insert is not conflict. Run npx tsc --noEmit and report evidence.'
```
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it. Read /mnt/d/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement only fingerprint library scope for B2-08. Create /mnt/d/SimpliSalonCLoud/lib/booksy/fingerprint.ts with computeFingerprint(salonId,eventType,clientEmailOrPhone,serviceName,startAtUtc) based on SHA256 and deterministic normalization rules: lowercase/trim contact with email preference, lowercase/trim service name with Polish diacritics removed and ul./dl./kr. removed, and start time truncated to 15-minute buckets.' bash ~/.claude/scripts/dad-exec.sh
```

## Po sprincie — OBOWIAZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
```
