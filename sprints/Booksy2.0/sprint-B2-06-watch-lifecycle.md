# Sprint B2-06 — gmail-watch-lifecycle
## Cel
Uruchomić lifecycle Gmail Watch: start/renew/stop, durable ingest notyfikacji Pub/Sub i manualny endpoint status/start dla salonu.

## Faza + Wave (Wave 4 — Parallel z: B2-04)
Faza 2, Wave 4.

## Architektura — dokumenty referencyjne (dad reader command for relevant arch doc)
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract watch lifecycle architecture for B2-06 including pubsub ingest-only handler and auth verification. FORMAT: concise checklist with risks.' bash ~/.claude/scripts/dad-exec.sh
```

## Zakres (checkbox list of what to build)
- [ ] Dodać `lib/booksy/watch-client.ts` z `startWatch`, `renewWatch`, `stopWatch`.
- [ ] Użyć `getDecryptedTokens()` z `lib/booksy/gmail-auth.ts`.
- [ ] Dodać webhook `POST /api/webhooks/booksy/gmail` (Pub/Sub push).
- [ ] Webhook ma dekodować `message.data` (base64), zapisywać pending notyfikację i natychmiast zwracać 200.
- [ ] Dodać weryfikację pochodzenia requestu z Google (Authorization lub claim `sub`).
- [ ] Dodać `app/api/integrations/booksy/watch/route.ts` z `POST` (manual start/renew) i `GET` (status watch).
- [ ] Obsłużyć feature flag `BOOKSY_USE_WATCH=false` jako circuit breaker.

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|---|---|---|
| `lib/booksy/watch-client.ts` | CREATE | codex-main |
| `app/api/webhooks/booksy/gmail/route.ts` | CREATE | codex-main |
| `app/api/integrations/booksy/watch/route.ts` | CREATE | codex-dad |

## Zaleznosci (Wymaga: / Blokuje: / Parallel z:)
Wymaga: B2-05, B2-01  
Blokuje: B2-07  
Parallel z: B2-04

## Prompt — codex-main + codex-dad (watch lifecycle + pubsub ingest)
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Read d:/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement B2-06. Create d:/SimpliSalonCLoud/lib/booksy/watch-client.ts with startWatch, renewWatch, stopWatch using getDecryptedTokens from gmail-auth and Gmail watch API. Create d:/SimpliSalonCLoud/app/api/webhooks/booksy/gmail/route.ts as durable ingest-only endpoint: decode base64 message.data to emailAddress/historyId, insert pending record into booksy_gmail_notifications, verify request authenticity from Google, return 200 immediately without parsing. Create d:/SimpliSalonCLoud/app/api/integrations/booksy/watch/route.ts with POST manual start/renew and GET status. Respect BOOKSY_USE_WATCH feature flag. Run npx tsc --noEmit and report evidence.'
```
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it. Read /mnt/d/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement only manual watch endpoint scope for B2-06. Create /mnt/d/SimpliSalonCLoud/app/api/integrations/booksy/watch/route.ts with POST start/renew watch and GET watch status for logged salon. Return watch_status, watch_expiration, last_notification_at. Keep BOOKSY_USE_WATCH circuit-breaker behavior.' bash ~/.claude/scripts/dad-exec.sh
```

## Po sprincie — OBOWIAZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
```
