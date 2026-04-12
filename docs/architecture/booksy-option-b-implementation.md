# Booksy Option B - plan wdrozenia w obecnej architekturze

Status: draft implementacyjny
Zakres: migracja obecnej integracji Booksy z modelu `Gmail search + cron + parser` do modelu `Gmail Watch + History API + durable event store + reconciliation`

## 1. Cel

Opcja B to nie jest "lepszy parser maili". To jest zmiana architektury ingestu:

- dzisiaj system aktywnie przeszukuje Gmail przez query i opiera stan na etykietach Gmail
- po wdrozeniu system ma traktowac Gmail jako zrodlo zdarzen, ale stan i audyt maja byc po stronie SimpliSalon
- glowny cel: wyeliminowac ciche utraty maili, miec replay, wykrywac awarie w kilka minut i ograniczyc skutki zmian szablonow Booksy

Dodatkowe zalozenie dla nowej wersji:

- jeden salon moze podlaczyc wiecej niz jedna skrzynke Gmail do ingestu Booksy
- architektura ma byc od razu multi-mailbox, nie jako pozniejszy refactor

## 2. Stan obecny w repo

Obecna implementacja Booksy jest juz produkcyjna, ale opiera sie na kruchym flow:

- OAuth Gmail:
  - [app/api/integrations/booksy/auth/route.ts](/d:/SimpliSalonCLoud/app/api/integrations/booksy/auth/route.ts)
  - [app/api/integrations/gmail/callback/route.ts](/d:/SimpliSalonCLoud/app/api/integrations/gmail/callback/route.ts)
- pobieranie maili przez search:
  - [lib/booksy/gmail-client.ts](/d:/SimpliSalonCLoud/lib/booksy/gmail-client.ts)
- parsowanie i apply do domeny:
  - [lib/booksy/processor.ts](/d:/SimpliSalonCLoud/lib/booksy/processor.ts)
- sync manualny i cron:
  - [app/api/integrations/booksy/sync/route.ts](/d:/SimpliSalonCLoud/app/api/integrations/booksy/sync/route.ts)
  - [app/api/cron/booksy/route.ts](/d:/SimpliSalonCLoud/app/api/cron/booksy/route.ts)
- UI integracji:
  - [app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx](/d:/SimpliSalonCLoud/app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx)
- obecne tabele i pola:
  - `salon_settings.booksy_enabled`
  - `salon_settings.booksy_gmail_tokens`
  - `salon_settings.booksy_gmail_email`
  - `salon_settings.booksy_sender_filter`
  - `salon_settings.booksy_last_sync_at`
  - `salon_settings.booksy_sync_stats`
  - `booksy_pending_emails`
  - `booksy_sync_logs`

Najwazniejsze ograniczenia obecnego modelu:

- query `searchBooksyEmails()` nie daje mocnego, trwalego kursora
- etykiety Gmail sa uzywane jako stan przetworzenia, ale nie sa transakcyjne z DB
- parser, dedupe i apply sa sprzezone w jednym przeplywie
- brak surowego, trwałego store dla maila i brak replay z poziomu SimpliSalon
- brak reconcilation, ktory potwierdza, ze wszystkie maile w skrzynce trafily do systemu

## Istniejące komponenty — stan przed Option B

### Webhook `/api/webhooks/booksy` — custom ingestion relay

**Pliki:**
- `app/api/webhooks/booksy/route.ts` — entry point (23 linii)
- `app/api/webhooks/booksy/handler.ts` — logika (142 linie), produkcyjna
- `app/api/webhooks/booksy/booksy-webhook-route.ts` — **dead code**, starsza wersja bez auth i DI
- `app/api/webhooks/booksy/test/route.ts` — narzędzie deweloperskie z session auth

**Czym jest:** NIE jest to Gmail Pub/Sub notification handler. To custom webhook do zewnętrznego wstrzykiwania emaili (np. relay service, manualna integracja). Format payloadu:
```json
{ "salonId": "uuid", "emails": [{"id"?: "...", "subject": "...", "body": "..."}] }
```

**Jak działa:**
- Auth przez `BOOKSY_WEBHOOK_SECRET` (Bearer token lub `x-booksy-webhook-secret` header), timing-safe compare
- Walidacja schematu przez Zod
- Tworzy `BooksyProcessor` i wywołuje `processEmail()` per email
- Dependency-injectable (testowalny)

**Status w Option B:**
- `handler.ts` + `route.ts` → **zachować** jako legacy ingestion path (może koegzystować z Gmail Watch)
- `booksy-webhook-route.ts` → **usunąć** (dead code, brak auth)
- `test/route.ts` → **zachować** jako narzędzie deweloperskie
- Gmail Pub/Sub endpoint (`/api/webhooks/booksy/gmail`) → **nowy endpoint**, musi być zbudowany od zera; format payloadu Gmail Pub/Sub jest inny: `{ message: { data: base64, messageId, publishTime }, subscription }`

### Dwa pliki procesora — wymagana decyzja przed Phase 1

- `lib/booksy/processor.ts` — importowany przez `handler.ts`, `test/route.ts`, `app/api/cron/booksy/route.ts`
- `lib/booksy/booksy-processor.ts` — drugi plik, relacja do `processor.ts` niejasna

**Decyzja wymagana przed Phase 1:** który z plików jest kanoniczny. Dokument zakłada refaktoryzację `BooksyProcessor` — musi być jasne który plik jest punktem startowym splitu parse/match/apply.

## 3. Co zostaje, a co sie zmienia

### Zostaje

- Gmail OAuth jako mechanizm podlaczenia skrzynki
- `salon_settings` jako glowny punkt konfiguracji per salon
- `bookings`, `clients`, `employees`, `services` jako docelowa domena apply
- `booksy_pending_emails` jako kolejka manual review
- dashboard ustawien Booksy jako miejsce dla health i operator actions

### Zmienia sie

- zamiast `messages.list(q=...)` glownym ingestem bedzie `watch -> notification -> history catch-up`
- stan przetwarzania przechodzi z Gmail labels do tabel Postgresa
- parser przestaje byc "source of truth"; source of truth staje sie raw email + event ledger
- cron nie robi juz "szukaj maili", tylko "catch-up / renewal / reconciliation"

## 4. Docelowa architektura w SimpliSalon

Docelowy przeplyw dla jednego salonu i jednej skrzynki:

1. Salon laczy Gmail jak dzisiaj.
2. Po poprawnym OAuth system zapisuje watch state dla skrzynki i wykonuje `users.watch`.
3. Gmail wysyla notyfikacje o zmianie skrzynki.
4. Ingress endpoint zapisuje notyfikacje do DB i szybko zwraca `2xx`.
5. Worker bierze ostatni `history_id` dla skrzynki i robi incremental catch-up przez History API.
6. Dla kazdej znalezionej wiadomosci system zapisuje raw email do storage + metadata do Postgresa.
7. Parser tworzy canonical event `created | cancelled | rescheduled` z confidence score.
8. Apply worker robi idempotent update w domenie rezerwacji.
9. Reconciliation job porownuje skrzynke z ledgerem i backfilluje brakujace maile.

Docelowy przeplyw dla jednego salonu i wielu skrzynek:

- salon ma `N` aktywnych rekordow mailbox/account
- kazda skrzynka ma osobny OAuth state, watch state, `last_history_id`, renewal i health
- wszystkie skrzynki wpadaja do wspolnego salonowego event streamu
- dedupe na poziomie salonu zapobiega utworzeniu tej samej wizyty kilka razy, jesli Booksy wysle podobny mail do wielu skrzynek

To miesci sie w obecnym stylu architektury repo:

- route handlers w `app/api/*`
- logika integracyjna w `lib/*`
- trwały stan i RLS w Supabase
- schedulery przez cron endpointy

## 5. Rekomendowany podzial odpowiedzialnosci w kodzie

Zeby dojsc do zgodnosci z [docs/architecture/integration-architecture.md](/d:/SimpliSalonCLoud/docs/architecture/integration-architecture.md), warto przy okazji uporzadkowac warstwe Booksy do adaptera integracyjnego.

Rekomendowana struktura:

- `lib/integrations/booksy/gmail-auth.ts`
  - OAuth URL, token merge, refresh handling
- `lib/integrations/booksy/watch-client.ts`
  - `watch`, `stop`, `renewWatch`, `historyList`, `getMessageRaw`
- `lib/integrations/booksy/notification-ingest.ts`
  - zapis powiadomien Gmail do DB
- `lib/integrations/booksy/raw-email-store.ts`
  - zapis metadata do Postgresa i raw MIME do Supabase Storage
- `lib/integrations/booksy/parser.ts`
  - wersjonowany parser canonical event
- `lib/integrations/booksy/matcher.ts`
  - dopasowanie cancel/reschedule do istniejacej wizyty
- `lib/integrations/booksy/apply.ts`
  - idempotent apply do `bookings`
- `lib/integrations/booksy/reconciliation.ts`
  - rolling window catch-up i full sync fallback

Praktycznie mozna to wdrozyc bez duzego rename od razu:

- etap 1: dopisac nowe moduly obok `lib/booksy/*`
- etap 2: przepiac endpointy z `lib/booksy/gmail-client.ts` i `lib/booksy/processor.ts` na nowa warstwe
- etap 3: dopiero potem porzadki i przeniesienie do `lib/integrations/booksy/*`

## 6. Model danych - nowe tabele

Obecne tabele nie wystarcza do opcji B. Potrzebny jest osobny ledger ingestu. Nazewnictwo powinno zostac salon-centric, zgodnie z repo.

**RLS — wymagania dla każdej nowej tabeli (bez wyjątku):**

- Każda tabela zawiera `salon_id` — RLS policy filtruje po `salon_id = public.get_user_salon_id()`
- Wyjątek: tabele z danymi operatorskimi (np. `booksy_reconciliation_runs`) — dostęp tylko przez service role (brak policy dla roli `authenticated`)
- Tokeny OAuth (`access_token`, `refresh_token`) w `booksy_gmail_accounts` — **nigdy nie selektowane w policy dla roli `authenticated`**; tylko service role worker
- Migracja musi zawierać: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY ... USING (salon_id = public.get_user_salon_id())`

### 6.1 `booksy_gmail_accounts`

Cel: stan polaczenia Gmail dla salonu, oddzielony od ogolnych settings.
To jest relacja `salon 1 -> N skrzynek`.

Minimalne kolumny:

- `id`
- `salon_id`
- `mailbox_label`
- `gmail_email`
- `oauth_tokens_encrypted` lub tymczasowo pointer do tokenow w `salon_settings`
- `auth_status` (`connected`, `reauth_required`, `disconnected`)
- `is_active`
- `is_primary`
- `last_auth_ok_at`
- `last_gmail_api_ok_at`
- `created_at`
- `updated_at`

Uwagi:

- na start mozna zostawic tokeny w `salon_settings.booksy_gmail_tokens` tylko jako warstwe migracyjna dla pierwszej skrzynki; model docelowy nie powinien zalezec od `salon_settings.booksy_gmail_tokens`
- `salon_settings.booksy_enabled` nadal moze zostac feature-toggle
- `mailbox_label` sluzy tylko operatorom, np. `Recepcja`, `Owner`, `Booksy backup`
- `is_primary` jest opcjonalne, ale praktyczne dla UI i polityk fallback

Recommended constraints:

- unique `(salon_id, gmail_email)`
- partial unique `(salon_id) where is_primary = true`

### 6.2 `booksy_gmail_watches`

Cel: stan watch i checkpoint history per salon/skrzynka.

Kolumny:

- `id`
- `salon_id`
- `booksy_gmail_account_id`
- `gmail_email`
- `watch_status` (`active`, `expired`, `failed`, `stopped`)
- `last_history_id`
- `watch_expiration_at`
- `last_watch_renewal_at`
- `last_notification_at`
- `last_full_sync_at`
- `last_error`
- `updated_at`

To jest glowny kursor ingestu.
Kazda skrzynka ma wlasny rekord watch/state.

### 6.3 `booksy_gmail_notifications`

Cel: durable zapis notyfikacji z Gmail zanim zacznie sie processing.

Kolumny:

- `id`
- `salon_id`
- `booksy_gmail_account_id`
- `gmail_email`
- `pubsub_message_id` lub `notification_id`
- `history_id`
- `payload`
- `received_at`
- `processed_at`
- `status` (`received`, `processed`, `failed`)
- `error`

Unique:

- unikalnosc po `pubsub_message_id`, jesli dostepne

### 6.4 `booksy_raw_emails`

Cel: immutable ledger wszystkich maili, ktore trafiły do SimpliSalon.

Kolumny:

- `id`
- `salon_id`
- `booksy_gmail_account_id`
- `gmail_message_id`
- `gmail_thread_id`
- `gmail_history_id`
- `internal_date`
- `subject`
- `from_address`
- `message_id_header`
- `storage_path`
- `raw_sha256`
- `ingest_source` (`watch`, `polling_fallback`, `reconciliation`, `manual_backfill`)
- `parse_status` (`pending`, `parsed`, `failed`)
- `created_at`

Unique:

- `(booksy_gmail_account_id, gmail_message_id)`

Wazne:

- ten sam salon moze dostac semantycznie ten sam mail na dwoch skrzynkach
- dlatego technical dedupe jest per skrzynka, ale semantic dedupe musi dzialac tez wyzej, na poziomie salonu

**Supabase Storage — specyfikacja bucketu dla raw MIME:**

- Bucket: `booksy-raw-emails` (private — brak publicznych URL)
- Path pattern: `{salon_id}/{booksy_gmail_account_id}/{year}/{month}/{gmail_message_id}.eml`
- Retention: 90 dni → archiwum lub usunięcie (GDPR: email zawiera dane osobowe klientów)
- Dostęp: wyłącznie przez service role (operator replay, parser worker)
- `storage_path` w tabeli wskazuje na ten bucket path; `raw_sha256` służy do weryfikacji integralności przy odczycie

### 6.5 `booksy_parsed_events`

Cel: wynik parsera jako append-only canonical event.

Kolumny:

- `id`
- `salon_id`
- `booksy_gmail_account_id`
- `raw_email_id`
- `parser_version`
- `event_type` (`created`, `cancelled`, `rescheduled`)
- `confidence_score`
- `trust_score`
- `event_fingerprint`
- `payload`
- `status` (`parsed`, `manual_review`, `failed`)
- `failure_reason`
- `created_at`

Unique:

- opcjonalnie `event_fingerprint` per salon dla semantic dedupe

### 6.6 `booksy_apply_ledger`

Cel: idempotencja apply do domeny.

Kolumny:

- `id`
- `salon_id`
- `booksy_gmail_account_id`
- `parsed_event_id`
- `idempotency_key`
- `booking_id`
- `action` (`create`, `cancel`, `reschedule`, `skip_duplicate`, `manual_review`)
- `status` (`applied`, `skipped`, `failed`)
- `error`
- `applied_at`

Unique:

- `(salon_id, idempotency_key)`

### 6.7 `booksy_reconciliation_runs`

Cel: historia catch-up i health.

Kolumny:

- `id`
- `salon_id`
- `run_type` (`scheduled`, `missing_notification`, `full_sync`, `manual`)
- `window_start`
- `window_end`
- `messages_seen`
- `messages_backfilled`
- `missing_count`
- `status`
- `error`
- `started_at`
- `finished_at`

### 6.8 Co zrobic z istniejacymi tabelami

- `booksy_sync_logs`
  - zachowac jako high-level audit dla UI
  - ale szczegolowy stan przeniesc do nowych ledgerow
  - warto dodac pole `booksy_gmail_account_id`, zeby logowac sync per skrzynka
- `booksy_pending_emails`
  - zachowac
  - zasilac z `booksy_parsed_events.status = manual_review|failed`
  - warto dodac pole `booksy_gmail_account_id`, zeby operator wiedzial, z ktorej skrzynki przyszedl przypadek
- `salon_settings.booksy_sync_stats`
  - zostawic jako cache pod UI
  - liczyc wtornie z ledgera, nie traktowac jako source of truth

## 7. Endpointy i joby do zbudowania

### 7.1 OAuth i onboarding

Mozna zostawic istniejące endpointy:

- [app/api/integrations/booksy/auth/route.ts](/d:/SimpliSalonCLoud/app/api/integrations/booksy/auth/route.ts)
- [app/api/integrations/gmail/callback/route.ts](/d:/SimpliSalonCLoud/app/api/integrations/gmail/callback/route.ts)

Ale callback po zapisie tokenow powinien dodatkowo:

- zalozyc/odswiezyc rekord `booksy_gmail_accounts`
- zainicjalizowac `booksy_gmail_watches`
- uruchomic pierwszy `watch`
- wykonac initial sync dla ostatnich X dni

Zmiana funkcjonalna:

- endpoint auth musi wspierac dolaczanie kolejnej skrzynki, nie tylko podmiane obecnej
- `state` OAuth powinien zawierac co najmniej `salon_id` i tryb akcji:
  - `connect_new_mailbox`
  - `reconnect_mailbox`

### 7.2 Ingress notyfikacji Gmail

Dodac nowy endpoint:

- `POST /api/webhooks/booksy/gmail`

Odpowiedzialnosc:

- przyjac notyfikacje
- rozwiazac, do ktorej skrzynki/salonu nalezy `gmail_email`
- zapisac rekord do `booksy_gmail_notifications`
- zaktualizowac `booksy_gmail_watches.last_notification_at`
- odpowiedziec szybko `200/204`

Ten endpoint nie powinien:

- pobierac wiadomosci z Gmail
- parsowac maili
- dotykac `bookings`

Ma tylko durable-ingestowac notification.

### 7.3 Worker catch-up

Dodac job/handler wewnetrzny:

- `POST /api/internal/booksy/process-notifications`

Odpowiedzialnosc:

- wybrac nieprzetworzone notyfikacje
- zablokowac rekord watch per skrzynka
- zrobic `history.list` od `last_history_id`
- przy `404` oznaczyc potrzebe full sync
- zapisac raw email metadata
- zaktualizowac `last_history_id`

**Concurrency — wzorzec blokowania (wymagany):**

```sql
SELECT * FROM booksy_gmail_watches
WHERE id = $1 AND watch_status = 'active'
FOR UPDATE SKIP LOCKED
```

- `SKIP LOCKED` — jesli inny worker juz przetwarza ten mailbox, pomijamy go zamiast czekac (brak deadlocka)
- Timeout locka: `SET LOCAL lock_timeout = '5s'` przed SELECT FOR UPDATE
- Jesli worker padnie z lockiem: Postgres automatycznie zwalnia lock przy rollbacku transakcji
- Kazda iteracja cron uruchamia jedno zapytanie per mailbox w osobnej transakcji

Wersja multi-mailbox:

- kolejka jest przetwarzana mailbox-by-mailbox
- awaria jednej skrzynki nie moze blokowac pozostalych skrzynek salonu

### 7.4 Parser worker

Dodac job:

- `POST /api/internal/booksy/parse`

Odpowiedzialnosc:

- wziac `booksy_raw_emails.parse_status = pending`
- pobrac raw MIME ze storage
- zbudowac canonical event
- zapisac `booksy_parsed_events`
- przy niskiej pewnosci skierowac do `booksy_pending_emails`

### 7.5 Apply worker

Dodac job:

- `POST /api/internal/booksy/apply`

Odpowiedzialnosc:

- wziac `booksy_parsed_events.status = parsed`
- policzyc `idempotency_key`
- znalezc lub utworzyc booking
- zapisac `booksy_apply_ledger`

### 7.6 Renewal i fallback cron

Zastapic logike z [app/api/cron/booksy/route.ts](/d:/SimpliSalonCLoud/app/api/cron/booksy/route.ts) trzema rolami:

- renew watch dla aktywnych skrzynek
- fallback catch-up dla skrzynek bez notyfikacji od X minut
- reconciliation dla rolling window per skrzynka i per salon

### 7.7 Manual operator actions

Nowe endpointy operatorowe:

- `POST /api/integrations/booksy/replay`
- `POST /api/integrations/booksy/reconcile`
- `POST /api/integrations/booksy/watch/renew`
- `GET /api/integrations/booksy/health`

## 8. Zasady parsera i apply

Opcja B nie usuwa parsera. Ona sprawia, ze parser przestaje byc pojedynczym punktem awarii.

### Parser

Minimalne wymagania:

- wersjonowany parser
- raw email zostaje nienaruszony
- wynik jako canonical JSON
- confidence score (progi: patrz niżej)
- trust score oparty o headers i sender policy

Canonical event payload powinien zawierac:

- `client_name`
- `client_phone`
- `client_email`
- `service_name`
- `employee_name`
- `start_at`
- `end_at`
- `old_start_at` dla reschedule
- `source_reference` jesli uda sie wydobyc

**Progi confidence (obowiązkowe — bez tych wartości parser nie jest "done"):**

| Wynik | Akcja |
|-------|-------|
| `confidence >= 0.85` | auto-apply |
| `0.50 <= confidence < 0.85` | manual review queue |
| `confidence < 0.50` | discard + alert |

Wyjątek: `cancelled` i `rescheduled` → próg auto-apply podniesiony do `0.92` (wyższe ryzyko błędu).

### Matching

Zachowac obecne heurystyki z [lib/booksy/processor.ts](/d:/SimpliSalonCLoud/lib/booksy/processor.ts), ale wyciagnac je do osobnej warstwy.

Reguly:

- `created`
  - mozna auto-apply przy nizszym progu (`>= 0.85`)
- `cancelled`
  - wymaga wyzszego confidence (`>= 0.92`) albo jednoznacznego matchu
- `rescheduled`
  - wymaga `>= 0.92` + stare i nowe okno, w przeciwnym razie manual review

### Idempotencja

Obowiazkowe poziomy dedupe:

- unique `(booksy_gmail_account_id, gmail_message_id)` w `booksy_raw_emails`
- unique `event_fingerprint` dla semantic dedupe na poziomie salonu
- unique `idempotency_key` w `booksy_apply_ledger`

Reguly multi-mailbox:

- technical duplicate:
  - ten sam Gmail message ID w tej samej skrzynce
- cross-mailbox semantic duplicate:
  - dwa rozne message ID z dwoch skrzynek, ale ten sam event biznesowy
- apply duplicate:
  - event juz zastosowany do domeny

Dlatego `event_fingerprint` powinien byc liczony z danych biznesowych, nie z `gmail_message_id`.

**Formuła fingerprinta (wymagana — bez niej dedupe jest niezdefiniowane):**

```
fingerprint = SHA256(
  salon_id
  + event_type           // created | cancelled | rescheduled
  + normalize(client_email OR client_phone)   // preferuj email, fallback na telefon
  + normalize(service_name)                   // lowercase, trim, usuń znaki specjalne
  + truncate_to_15min(start_at_utc)           // tolerancja ±15 min dla reschedule
)
```

Uwagi do normalizacji:
- `service_name`: lowercase, trim whitespace, usuń polskie znaki diakrytyczne, usuń `ul.`/`dl.`/`kr.` warianty
- `truncate_to_15min`: zaokrąglij do pełnego kwadransa (floor do 15 min) — absorbuje drobne rozbieżności przy reschedule
- Dla `rescheduled`: fingerprint liczyć z **nowym** `start_at` (stare okno to `old_start_at`, nie wchodzi do fingerprinta)

## 9. UI - co zmienic w obecnym panelu

Obecny panel w [app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx](/d:/SimpliSalonCLoud/app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx) jest dobrym miejscem na operator UI, ale trzeba zmienic model informacji.

Zostawic:

- connect / reconnect / disconnect Gmail
- statystyki
- pending/manual review
- przycisk "synchronizuj teraz"

Dodac:

- liste podlaczonych skrzynek
- mozliwosc `Dodaj kolejna skrzynke`
- status watch: `active`, `expired`, `renewing`, `failed`
- `last_notification_at`
- `last_history_id_applied_at`
- `auth_status`
- backlog:
  - raw pending
  - parse failed
  - manual review
  - apply failed
- akcje operatora:
  - renew watch
  - replay last 24h
  - full reconcile 14 days
  - deactivate mailbox
  - set primary mailbox

Model UI:

- widok salonowy:
  - laczny health integracji Booksy
  - agregowane backlogi i statystyki
- widok per skrzynka:
  - health, ostatni sync, auth status, watch status, replay/reconnect

Usunac z modelu mentalnego UI:

- Gmail labels jako cokolwiek istotnego dla stanu

## 10. Plan wdrozenia krok po kroku

### Wymagania infrastrukturalne (przed Fazą 2)

Gmail Watch wymaga GCP Pub/Sub — bez tego `/api/webhooks/booksy/gmail` nigdy nie dostanie powiadomień. To zależność infrastrukturalna poza Next.js/Supabase, wymagana **przed dispatchem Fazy 2**:

| Krok | Opis |
|------|------|
| GCP project | Włącz Gmail API + Cloud Pub/Sub API |
| Pub/Sub topic | `booksy-gmail-notifications` |
| Pub/Sub subscription | Push → `https://[domain]/api/webhooks/booksy/gmail` |
| Service account | `gmail.readonly` + `pubsub.publisher` |
| Gmail Watch grant | `https://www.googleapis.com/auth/gmail.readonly` scope w OAuth |
| Env var | `GOOGLE_BOOKSY_PUBSUB_TOPIC=projects/{project}/topics/booksy-gmail-notifications` |

Bez tych kroków `users.watch()` w Gmail API zwróci błąd autoryzacji.

### Faza 0 - hardening bez zmiany flow

- dodac explicit health status dla auth i sync
- logowac `invalid_grant` do stanu salonu
- utrzymac obecny sync, ale bez dalszego rozbudowywania search-based modelu

### Faza 0.5 - szyfrowanie tokenów OAuth (przed Fazą 1)

**Wymagane przed dodaniem multi-mailbox** — każda nowa skrzynka to kolejny token w bazie. Wyciek niezaszyfrowanych tokenów = pełny dostęp do wszystkich skrzynek wszystkich salonów.

- Zaszyfruj `access_token` i `refresh_token` w `booksy_gmail_accounts` (AES-256-GCM)
- Klucz szyfrowania: `BOOKSY_TOKEN_ENCRYPTION_KEY` (32 bajty, env-only, nigdy w DB)
- Obecnie tokeny mogą być w `salon_settings` — zmigruj do `booksy_gmail_accounts` przy tej okazji
- Odszyfrowanie tylko w server-side worker (nigdy w client component / route handler bez auth)

### Faza 1 - durable raw ingest

- dodac nowe tabele: `booksy_raw_emails`, `booksy_parsed_events`, `booksy_apply_ledger`
- przygotowac `booksy_gmail_accounts` jako model wieloskrzynkowy, nawet jesli na poczatku aktywna bedzie jedna skrzynka
- zapisac raw mail przy obecnym manual/cron sync
- parser i apply odczytuja juz z ledgera

Efekt:

- replay i audyt pojawia sie jeszcze przed Watch API

### Faza 2 - watch + history

- dodac `booksy_gmail_accounts`, `booksy_gmail_watches`, `booksy_gmail_notifications`
- wdrozyc `watch`, renewal i `history.list`
- przepiac cron z search-based sync na catch-up

**Feature flag circuit breaker (obowiązkowy przez całą Fazę 2):**

```
BOOKSY_USE_WATCH=false   // domyślnie wyłączone; włącz per-salon lub globalnie
```

Jeśli `BOOKSY_USE_WATCH=false` → cron fallback na stary search-based sync. Pozwala wrócić do poprzedniego flow bez deployu w razie problemów z Watch API.

Efekt:

- search query przestaje byc glownym zrodlem ingestu (przy `BOOKSY_USE_WATCH=true`)

### Faza 3 - reconciliation i operator tooling

- rolling window reconcile
- replay controls
- health dashboard
- SLA/alerting
- obsluga wielu skrzynek w UI i operator actions

Efekt:

- koniec cichych awarii jako klasy problemu po stronie SimpliSalon

## 11. Alerting i health

Minimalny zestaw health metrics:

- `auth_status`
- `last_gmail_api_ok_at`
- `watch_expiration_at`
- `last_notification_at`
- `raw_ingest_backlog`
- `parse_failure_rate`
- `manual_review_queue_depth`
- `apply_failure_count`
- `reconciliation_missing_count`

Wszystkie te metryki powinny byc dostepne:

- per skrzynka
- agregowane per salon

Minimalne alerty:

- `auth_status = reauth_required`
- watch wygasa w < 12h
- brak notyfikacji i brak catch-up progress > 10 min w godzinach pracy
- reconciliation wykrywa brakujace maile
- nagly wzrost parse failures

## 12. Co wolno odlozyc

Na pierwszy release opcji B nie trzeba miec:

- osobnego zewnetrznego brokera
- perfekcyjnego UI replay
- pelnego trust scoringu SPF/DKIM/DMARC
- pelnej migracji folderow do `lib/integrations/booksy/*`

Trzeba miec od razu:

- durable notification ingest
- durable raw email store
- `history_id` checkpoint
- 404 -> full sync fallback
- idempotent apply ledger
- reconciliation

## 13. Decyzje implementacyjne dla tego repo

Rekomendowane decyzje:

1. Nie przepisywac od razu calego obecnego `BooksyProcessor`.
   Najpierw rozdzielic go logicznie na parse / match / apply.

2. Nie opierac nowego systemu o Gmail labels.
   Labels moga zostac najwyzej jako pomoc debugowa.

3. Nie trzymac raw MIME w `booksy_sync_logs`.
   Raw powinien trafic do storage, a DB ma trzymac pointer i hash.

4. Nie robic "watch only".
   Fallback polling/reconciliation jest czescia opcji B, nie dodatkiem.

5. Zachowac zgodnosc z obecnym modelem salon-centric i RLS.
   Wszystkie nowe tabele musza miec `salon_id`.

6. Modelowac Gmail jako `wiele skrzynek na salon` od pierwszej migracji.
   Jedna skrzynka to tylko przypadek szczegolny.

## 14. Definition of Done dla opcji B

Opcja B jest wdrozona dopiero wtedy, gdy:

- nowy mail Booksy trafia do `booksy_raw_emails` bez uzycia Gmail search query
- system utrzymuje `last_history_id` per skrzynka
- dany mail mozna replayowac bez odpytywania Gmail jeszcze raz
- duplikaty nie tworza nowych bookingow
- dwa maile z dwoch roznych skrzynek, opisujace to samo zdarzenie, nie tworza duplikatow bookingow
- `cancelled` i `rescheduled` maja jawny manual-review path
- operator widzi, czy problem dotyczy auth, watch, parsera czy apply
- reconcile wykrywa brakujace maile i umie je backfillowac

## 15. Minimalny backlog implementacyjny

1. Migracje Supabase dla nowych tabel i indeksow.
2. Model `booksy_gmail_accounts` i onboarding kolejnych skrzynek.
3. Warstwa `watch/history/raw-store`.
4. Ingress endpoint dla notyfikacji Gmail.
5. Refactor parsera do canonical event.
6. Apply ledger i idempotency keys.
7. Cron renewal + fallback catch-up.
8. Reconciliation job.
9. Rozszerzenie UI Booksy o health/backlog/operator actions per skrzynka.

## 16. Najwazniejsza esencja

Jesli zespol ma zapamietac tylko jedna rzecz:

Opcja B to przejscie z modelu "co jakis czas przeszukaj Gmail i sproboj cos sparsowac" do modelu "kazda zmiana skrzynki zostawia trwały slad w SimpliSalon, a booking jest tylko projekcja z event ledgera".

To jest wlasciwy kierunek dla obecnej architektury SimpliSalon, bo pasuje do:

- Next.js route handlers jako orchestration layer
- Supabase/Postgres jako durable state
- istniejacego panelu operatorowego Booksy
- salon-centric tenancy i RLS
