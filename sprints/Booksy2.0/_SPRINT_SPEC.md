# Booksy 2.0 — Sprint Spec (input dla codex workers)

## Wave diagram (kolejność + równoległość)

```
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

Arch doc: `docs/architecture/booksy-option-b-implementation.md`

---

## Specs per sprint

### B2-00 — cleanup-dead-code
- Cel: Usuń dead code i ustal jeden kanoniczny plik procesora przed Phase 1
- Faza: Pre
- Worker: Claude (bezpośrednia edycja)
- Wymaga: Brak | Blokuje: B2-01 | Parallel z: Brak
- Akcje:
  - DELETE `app/api/webhooks/booksy/booksy-webhook-route.ts` (dead code, brak auth, zastąpiony przez handler.ts)
  - ZACHOWAJ `lib/booksy/processor.ts` jako kanoniczny (importowany przez handler.ts, cron, test endpoint)
  - Zbadaj `lib/booksy/booksy-processor.ts` — jeśli to duplikat lub stara wersja → DELETE; jeśli ma unikalne metody → przenieś do processor.ts i usuń plik
  - Nie zmieniaj logiki procesora — tylko konsolidacja struktury
- Done when: `npx tsc --noEmit` clean, jeden plik procesora, zero martwych plików

### B2-01 — db-gmail-accounts
- Cel: Tabela booksy_gmail_accounts z zaszyfrowanymi tokenami OAuth; podstawa multi-mailbox
- Faza: 0.5 (token encryption przed Phase 1)
- Worker: codex-dad (SQL migration)
- Wymaga: B2-00 | Blokuje: B2-02, B2-03 | Parallel z: Brak
- Migration file: `supabase/migrations/20260420000001_booksy_gmail_accounts.sql`
- Tabela booksy_gmail_accounts:
  - id UUID PK DEFAULT gen_random_uuid()
  - salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
  - gmail_email TEXT NOT NULL
  - display_name TEXT
  - encrypted_access_token TEXT NOT NULL
  - encrypted_refresh_token TEXT NOT NULL
  - token_expires_at TIMESTAMPTZ
  - auth_status TEXT NOT NULL DEFAULT 'active' CHECK (auth_status IN ('active','revoked','expired','error'))
  - is_active BOOLEAN NOT NULL DEFAULT true
  - is_primary BOOLEAN NOT NULL DEFAULT false
  - last_auth_at TIMESTAMPTZ
  - last_error TEXT
  - created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  - updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  - UNIQUE(salon_id, gmail_email)
  - Partial unique index: UNIQUE(salon_id) WHERE is_primary = true
- RLS:
  - SELECT dla roli authenticated: wszystkie kolumny OPRÓCZ encrypted_access_token, encrypted_refresh_token
  - INSERT/UPDATE/DELETE: salon_id = get_user_salon_id()
- Env vars do dodania w .env.example: BOOKSY_TOKEN_ENCRYPTION_KEY (32 bajty hex)
- Po migracji: supabase db push + gen types + tsc

### B2-02 — db-raw-email-ledger
- Cel: Tabele booksy_raw_emails, booksy_parsed_events, booksy_apply_ledger + Storage bucket
- Faza: 1
- Worker: codex-dad (SQL)
- Wymaga: B2-01 | Blokuje: B2-03, B2-04, B2-05 | Parallel z: Brak
- Migration file: `supabase/migrations/20260420000002_booksy_raw_email_ledger.sql`
- Tabela booksy_raw_emails:
  - id UUID PK DEFAULT gen_random_uuid()
  - salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
  - booksy_gmail_account_id UUID NOT NULL REFERENCES booksy_gmail_accounts(id) ON DELETE CASCADE
  - gmail_message_id TEXT NOT NULL
  - gmail_thread_id TEXT
  - gmail_history_id BIGINT
  - internal_date TIMESTAMPTZ
  - subject TEXT
  - from_address TEXT
  - message_id_header TEXT
  - storage_path TEXT  -- Supabase Storage bucket: booksy-raw-emails
  - raw_sha256 TEXT
  - ingest_source TEXT NOT NULL CHECK (ingest_source IN ('watch','polling_fallback','reconciliation','manual_backfill'))
  - parse_status TEXT NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending','parsed','failed'))
  - created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  - UNIQUE(booksy_gmail_account_id, gmail_message_id)
- Tabela booksy_parsed_events:
  - id UUID PK DEFAULT gen_random_uuid()
  - salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
  - booksy_raw_email_id UUID NOT NULL REFERENCES booksy_raw_emails(id)
  - parser_version TEXT NOT NULL DEFAULT 'v1'
  - event_type TEXT NOT NULL CHECK (event_type IN ('created','cancelled','rescheduled','unknown'))
  - confidence_score NUMERIC(4,3) NOT NULL
  - trust_score NUMERIC(4,3)
  - event_fingerprint TEXT NOT NULL
  - payload JSONB NOT NULL
  - status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','manual_review','discarded'))
  - created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  - UNIQUE(salon_id, event_fingerprint)
- Tabela booksy_apply_ledger:
  - id UUID PK DEFAULT gen_random_uuid()
  - salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
  - booksy_parsed_event_id UUID REFERENCES booksy_parsed_events(id)
  - idempotency_key TEXT NOT NULL UNIQUE
  - target_table TEXT
  - target_id UUID
  - operation TEXT NOT NULL CHECK (operation IN ('created','updated','skipped','failed'))
  - applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  - error_message TEXT
- Storage bucket comment:
  -- Bucket "booksy-raw-emails" musi być stworzony ręcznie w Supabase Dashboard:
  -- private (NIE publiczny), max file size: brak limitu, MIME: brak ograniczeń (raw .eml)
  -- Path pattern używany w kodzie: {salon_id}/{account_id}/{year}/{month}/{gmail_message_id}.eml
- Indeksy: salon_id + parse_status na booksy_raw_emails; salon_id + status na booksy_parsed_events
- RLS: wszystkie tabele, salon_id = get_user_salon_id()

### B2-03 — oauth-onboarding-refactor
- Cel: OAuth callback zapisuje do booksy_gmail_accounts (nie salon_settings); obsługa wielu skrzynek
- Faza: 1
- Workers: codex-main (callback route) + codex-dad (lib/booksy/gmail-auth.ts)
- Wymaga: B2-01 | Blokuje: B2-04 | Parallel z: B2-05
- Pliki:
  - MODIFY `app/api/integrations/gmail/callback/route.ts`: upsert do booksy_gmail_accounts; czytaj state param: action = connect_new_mailbox | reconnect_mailbox; szyfruj tokeny przez lib/booksy/gmail-auth.ts
  - CREATE `lib/booksy/gmail-auth.ts`: encrypt(token: string): string, decrypt(encrypted: string): string — AES-256-GCM, klucz z BOOKSY_TOKEN_ENCRYPTION_KEY; eksportuj też getDecryptedTokens(accountId, supabase)
- Constraints:
  - NIE przechowuj odszyfrowanych tokenów w pamięci dłużej niż potrzeba
  - callback musi obsługiwać error state (np. access_denied) — redirect z error param
  - Zachowaj istniejącą logikę redirect po OAuth

### B2-04 — raw-ingest-existing-path
- Cel: Istniejący sync/cron zapisuje raw emaile do ledgera; split parsera na parse+apply
- Faza: 1 (mostek między starym flow a nowym)
- Workers: codex-main (gmail-client.ts) + codex-dad (processor.ts split)
- Wymaga: B2-02 + B2-03 | Blokuje: B2-08 | Parallel z: B2-06
- Pliki:
  - MODIFY `lib/booksy/gmail-client.ts`: po pobraniu wiadomości Gmail → INSERT do booksy_raw_emails z ingest_source='polling_fallback'; zwróć booksy_raw_email.id do procesora
  - MODIFY `lib/booksy/processor.ts`: zamiast bezpośrednio tworzyć booking → INSERT do booksy_parsed_events (status=pending); osobna metoda applyParsedEvent() → INSERT do booksy_apply_ledger; zachowaj obecną logikę parsowania
- Constraints:
  - NIE zmieniaj zewnętrznego interfejsu BooksyProcessor.processEmail() — cron i webhook nadal działają
  - Jeśli insert do booksy_raw_emails fail → loguj + kontynuuj (nie blokuj istniejącego flow)
  - Feature flag: jeśli BOOKSY_LEDGER_ENABLED=false → stary flow bez ledgera

### B2-05 — db-watch-tables
- Cel: Tabele booksy_gmail_watches i booksy_gmail_notifications dla Gmail Watch API
- Faza: 2 (przygotowanie DB)
- Worker: codex-dad (SQL)
- Wymaga: B2-02 | Blokuje: B2-06, B2-07 | Parallel z: B2-03
- Migration file: `supabase/migrations/20260420000003_booksy_watch_tables.sql`
- Tabela booksy_gmail_watches:
  - id UUID PK DEFAULT gen_random_uuid()
  - salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
  - booksy_gmail_account_id UUID NOT NULL UNIQUE REFERENCES booksy_gmail_accounts(id) ON DELETE CASCADE
  - watch_status TEXT NOT NULL DEFAULT 'pending' CHECK (watch_status IN ('active','expired','error','pending','stopped'))
  - last_history_id BIGINT
  - watch_expiration TIMESTAMPTZ
  - last_notification_at TIMESTAMPTZ
  - last_sync_at TIMESTAMPTZ
  - last_error TEXT
  - renewal_count INT NOT NULL DEFAULT 0
  - created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  - updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
- Tabela booksy_gmail_notifications:
  - id UUID PK DEFAULT gen_random_uuid()
  - salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
  - booksy_gmail_account_id UUID NOT NULL REFERENCES booksy_gmail_accounts(id) ON DELETE CASCADE
  - pubsub_message_id TEXT NOT NULL UNIQUE
  - history_id BIGINT NOT NULL
  - email_address TEXT NOT NULL
  - received_at TIMESTAMPTZ NOT NULL DEFAULT now()
  - processed_at TIMESTAMPTZ
  - processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','processed','failed','skipped'))
  - error_message TEXT
  - created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- Tabela booksy_reconciliation_runs:
  - id UUID PK DEFAULT gen_random_uuid()
  - salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
  - booksy_gmail_account_id UUID REFERENCES booksy_gmail_accounts(id)
  - window_start TIMESTAMPTZ NOT NULL
  - window_end TIMESTAMPTZ NOT NULL
  - status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed'))
  - emails_checked INT DEFAULT 0
  - emails_missing INT DEFAULT 0
  - emails_backfilled INT DEFAULT 0
  - error_message TEXT
  - started_at TIMESTAMPTZ NOT NULL DEFAULT now()
  - completed_at TIMESTAMPTZ
- RLS: wszystkie tabele, salon_id = get_user_salon_id()

### B2-06 — gmail-watch-lifecycle
- Cel: Gmail Watch start/renew, Pub/Sub notification handler, feature flag
- Faza: 2
- Workers: codex-main (watch-client + webhook) + codex-dad (manual watch endpoint)
- Wymaga: B2-05 + B2-01 | Blokuje: B2-07 | Parallel z: B2-04
- Pliki:
  - CREATE `lib/booksy/watch-client.ts`:
    - startWatch(accountId, supabase): upsert booksy_gmail_watches, call gmail.users.watch()
    - renewWatch(watchId, supabase): call watch ponownie, update expiration
    - stopWatch(watchId, supabase): call gmail.users.stop(), set watch_status='stopped'
    - Użyj getDecryptedTokens() z lib/booksy/gmail-auth.ts
  - CREATE `app/api/webhooks/booksy/gmail/route.ts`:
    - POST handler dla Google Pub/Sub push notifications
    - Decode base64 message.data → { emailAddress, historyId }
    - INSERT do booksy_gmail_notifications (processing_status='pending')
    - Odpowiedz 200 natychmiast (bez parsowania/fetchowania — durable ingest only)
    - Weryfikuj że request pochodzi z Google (sprawdź Authorization header lub sub claim)
  - CREATE `app/api/integrations/booksy/watch/route.ts`:
    - POST: manualny start/renew watch dla salon
    - GET: status watch (watch_status, expiration, last_notification_at)
- Env vars: BOOKSY_USE_WATCH=false (feature flag circuit breaker), GOOGLE_BOOKSY_PUBSUB_AUDIENCE

### B2-07 — catchup-worker
- Cel: Worker przetwarzający notyfikacje — Gmail History API, idempotentny, izolowany per mailbox
- Faza: 2
- Worker: codex-main
- Wymaga: B2-06 + B2-02 | Blokuje: B2-09 | Parallel z: B2-08
- Pliki:
  - CREATE `app/api/internal/booksy/process-notifications/route.ts`:
    - POST handler (internal — wymaga CRON_SECRET lub internal auth)
    - Dla każdej pending notyfikacji w booksy_gmail_notifications:
      1. SELECT booksy_gmail_watches WHERE booksy_gmail_account_id=X FOR UPDATE SKIP LOCKED (SET LOCAL lock_timeout='5s')
      2. Jeśli lock niedostępny → SKIP LOCKED → pomiń (inny worker to ma)
      3. Wywołaj Gmail History API: history.list(startHistoryId=last_history_id)
      4. Jeśli 404 → ustaw needs_full_sync=true w booksy_gmail_watches, skip
      5. Dla każdej wiadomości → INSERT do booksy_raw_emails (ON CONFLICT DO NOTHING)
      6. Pobierz MIME z Gmail API → zapisz do Supabase Storage bucket 'booksy-raw-emails'
      7. UPDATE booksy_gmail_watches SET last_history_id=newHistoryId, last_sync_at=now()
      8. UPDATE booksy_gmail_notifications SET processing_status='processed'
    - Awaria jednej skrzynki NIE blokuje pozostałych (try/catch per mailbox, loguj błąd)
- Constraints: Internal endpoint, nie public. CRON_SECRET w headerze.

### B2-08 — parse-apply-workers
- Cel: Parser z confidence thresholds, fingerprint SHA256, apply z idempotency key
- Faza: 2
- Workers: codex-main (parse + apply routes) + codex-dad (fingerprint lib)
- Wymaga: B2-04 + B2-06 | Blokuje: B2-09 | Parallel z: B2-07
- Pliki:
  - CREATE `lib/booksy/fingerprint.ts`:
    - computeFingerprint(salonId, eventType, clientEmail|phone, serviceName, startAtUtc): string
    - SHA256(salonId + eventType + normalizeContact() + normalizeServiceName() + truncateTo15min(startAt))
    - normalizeContact: lowercase, trim, preferuj email nad phone
    - normalizeServiceName: lowercase, trim, usuń diakrytyki (pl), usuń 'ul.'/'dl.'/'kr.'
    - truncateTo15min: Math.floor(minutes/15)*15 — tolerancja ±15min
  - CREATE `app/api/internal/booksy/parse/route.ts`:
    - POST handler (internal, CRON_SECRET)
    - Pobierz booksy_raw_emails WHERE parse_status='pending' LIMIT 50
    - Pobierz MIME z Storage, sparsuj przez istniejącą logikę z processor.ts
    - Oblicz confidence_score i trust_score (headers: from === Booksy sender → trust++)
    - Oblicz event_fingerprint przez computeFingerprint()
    - INSERT do booksy_parsed_events (ON CONFLICT event_fingerprint DO NOTHING)
    - UPDATE booksy_raw_emails SET parse_status='parsed'
  - CREATE `app/api/internal/booksy/apply/route.ts`:
    - POST handler (internal, CRON_SECRET)
    - Pobierz booksy_parsed_events WHERE status='pending'
    - confidence >= 0.85 (lub 0.92 dla cancelled/rescheduled) → auto-apply
    - 0.50-0.85 → UPDATE status='manual_review'
    - < 0.50 → UPDATE status='discarded'
    - Auto-apply: oblicz idempotency_key = SHA256(salon_id + event_fingerprint)
    - INSERT INTO booksy_apply_ledger (idempotency_key) ON CONFLICT DO NOTHING
    - Jeśli nie conflict → utwórz/zaktualizuj booking, UPDATE booksy_parsed_events SET status='applied'

### B2-09 — cron-refactor
- Cel: Cron przepia się z search-based na watch+catchup; feature flag jako circuit breaker
- Faza: 2
- Worker: codex-main
- Wymaga: B2-07 + B2-08 | Blokuje: B2-10, B2-11 | Parallel z: Brak
- Pliki:
  - MODIFY `app/api/cron/booksy/route.ts`:
    - Jeśli BOOKSY_USE_WATCH=true:
      1. POST /api/internal/booksy/process-notifications (catch-up)
      2. POST /api/internal/booksy/parse
      3. POST /api/internal/booksy/apply
      4. Odnów watche które wygasną w ciągu 12h: POST /api/integrations/booksy/watch dla każdego
    - Jeśli BOOKSY_USE_WATCH=false (domyślnie w Phase 2):
      → stary flow search-based (bez zmian)
    - Feature flag → możliwość powrotu bez deployu

### B2-10 — reconciliation
- Cel: Rolling 14-day reconciliation job — wykrywa i backfilluje brakujące emaile
- Faza: 3
- Worker: codex-main
- Wymaga: B2-09 | Blokuje: B2-12 | Parallel z: B2-11
- Pliki:
  - CREATE `app/api/internal/booksy/reconcile/route.ts`:
    - POST handler (internal, CRON_SECRET)
    - Dla każdego aktywnego mailbox:
      1. INSERT booksy_reconciliation_runs (window: now()-14d → now(), status='running')
      2. Gmail API: messages.list(q='from:noreply@booksy.com', after:window_start)
      3. Porównaj gmail_message_ids z booksy_raw_emails
      4. Brakujące → backfill (INSERT do booksy_raw_emails z ingest_source='reconciliation')
      5. UPDATE booksy_reconciliation_runs (status='completed', counts)
    - Jeden run per mailbox, awaria jednego nie blokuje pozostałych
  - MODIFY `app/api/cron/booksy/route.ts`: dodaj wywołanie reconcile raz dziennie (sprawdź godzinę lub licznik)

### B2-11 — health-alerting
- Cel: Per-mailbox health metrics endpoint + reguły alertów
- Faza: 3
- Workers: codex-main (health route) + codex-dad (lib/booksy/health-check.ts)
- Wymaga: B2-09 | Blokuje: B2-12 | Parallel z: B2-10
- Pliki:
  - CREATE `lib/booksy/health-check.ts`:
    - getMailboxHealth(accountId, supabase): MailboxHealth
    - MailboxHealth: { authStatus, watchStatus, watchExpiresAt, lastNotificationAt, rawBacklog, parseFailureRate, manualQueueDepth, applyFailures, lastReconciliationMissing }
    - getSalonHealth(salonId, supabase): { overall: 'ok'|'warning'|'critical', mailboxes: MailboxHealth[] }
    - overall='critical' jeśli auth=revoked|expired LUB watch wygasa < 1h LUB lastNotification > 30min i godziny pracy
    - overall='warning' jeśli watch wygasa < 12h LUB parseFailureRate > 0.1
  - CREATE `app/api/integrations/booksy/health/route.ts`:
    - GET: zwróć getSalonHealth() dla zalogowanego salonu
    - Używany przez UI do wyświetlenia statusu

### B2-12 — multi-mailbox-ui
- Cel: UI: lista skrzynek, health per skrzynka, add/remove/set-primary, operator actions
- Faza: 3
- Workers: codex-main (page.tsx refactor) + codex-dad (komponenty)
- Wymaga: B2-10 + B2-11 | Blokuje: Brak | Parallel z: Brak
- Pliki:
  - MODIFY `app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx`:
    - Pobierz booksy_gmail_accounts (bez tokenów) + health ze /api/integrations/booksy/health
    - Renderuj MailboxList zamiast single-mailbox view
  - CREATE `components/integrations/booksy/MailboxList.tsx`:
    - Lista accountów, każdy z MailboxHealthCard
    - Przyciski: Add mailbox (→ OAuth), Set as primary, Deactivate, Reconnect (jeśli auth error)
  - CREATE `components/integrations/booksy/MailboxHealthCard.tsx`:
    - Status auth, watch (expiry), last notification, backlog counts, ostatnia reconciliacja
    - Operator actions: Renew watch, Replay 24h, Full reconcile 14 days
  - CREATE `components/integrations/booksy/AddMailboxButton.tsx`:
    - Przycisk → redirect do OAuth z action=connect_new_mailbox w state
