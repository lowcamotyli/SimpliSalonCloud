# Plan implementacji CRM – moduł Klienci (SMS/Email Marketing)

> Data sporządzenia: 2026-02-24
> Ostatnia aktualizacja: 2026-02-24
> Status: Do realizacji
> Kontekst: SimpliSalonCloud – aplikacja Next.js 14 / Supabase

---

## 1. Cel i zakres

Rozbudowa modułu Klienci o funkcjonalności CRM:
- **Segmentacja klientów** wg daty ostatniej wizyty, liczby wizyt, wydanej kwoty, usługi itp.
- **Wysyłka wiadomości** (Email i/lub SMS) do wybranych segmentów lub pojedynczych klientów
- **Szablony wiadomości** z dynamicznymi zmiennymi (imię, data wizyty, itp.)
- **Kampanie** – zaplanowane lub jednorazowe wysyłki do segmentu
- **Historia wysyłek** – log wiadomości z statusem dostarczenia
- **Automatyzacje** – cykliczne wiadomości wyzwalane zdarzeniami (np. "brak wizyty od 30 dni")

---

## 2. Stan obecny (co już istnieje)

| Element | Stan |
|---|---|
| CRUD klientów | ✅ Istnieje (`/clients/page.tsx`, `use-clients.ts`, `/api/clients`) |
| Pole `last_visit_at` w tabeli `clients` | ❌ Brak – trzeba dodać + trigger z `bookings` |
| Email – infrastruktura | ⚠️ Zaślepka (payroll email mock w `/api/payroll/send-email`) |
| SMS – infrastruktura | ❌ Brak |
| Szablony wiadomości | ❌ Brak |
| Kampanie / segmentacja | ❌ Brak |
| Historia wiadomości | ❌ Brak |
| Ustawienia dostawców | ❌ Brak formularza, klucze nie skonfigurowane |
| Feature gate `sms_notifications` | ✅ Zdefiniowany (od planu Professional) |
| Feature gate `email_notifications` | ✅ Zdefiniowany (od planu Starter) |
| Kolejkowanie (Upstash Redis) | ✅ `@upstash/redis` i `@upstash/ratelimit` zainstalowane |

---

## 3. Wybór dostawców zewnętrznych

### Email – **Resend**
- Wzmiankowany w istniejącym kodzie (`/api/payroll/send-email`)
- Oficjalne SDK dla Next.js (`resend` npm package)
- Darmowy tier: 3 000 maili/miesiąc
- Webhook dla statusów: delivered, bounced, complained

### SMS – **SMSAPI.pl**
- Polski dostawca, niższy koszt dla numerów PL niż Twilio
- REST API (brak dedykowanego SDK – używamy `fetch` lub `axios`)
- Rejestracja numeru nadawcy (nazwa salonu jako sender)
- Raportowanie dostarczenia przez callback URL (webhook)
- Dokumentacja API: `https://www.smsapi.pl/rest-api`

### Kolejkowanie kampanii – **Upstash QStash**
- Upstash jest już w projekcie (`@upstash/redis`, `@upstash/ratelimit`)
- QStash = HTTP-based message queue idealny dla Vercel (bezstanowy)
- Wiadomości do kolejki: `@upstash/qstash` (nowy package)
- Mechanizm: kampania → wstawienie zadań do QStash → QStash wywołuje endpoint worker per wiadomość
- Automatyczny retry przy błędach (konfigurowalne: np. 3 próby z exponential backoff)
- Harmonogram (`scheduled_at`) obsługiwany natywnie przez QStash (delay)

---

## 4. Limity CRM per plan subskrypcji

Oparcie na istniejących planach (`subscription-manager.ts`):

| Plan | Cena | Email/mies. | SMS/mies. | Automatyzacje | Kampanie | CRM dostęp |
|---|---|---|---|---|---|---|
| **Starter** (99 PLN) | 99 PLN | 500 | ❌ brak | ❌ brak | ❌ brak | Podstawowy – tylko quick-send email do 1 klienta |
| **Professional** (299 PLN) | 299 PLN | 2 000 | 200 | 2 aktywne | ✅ pełne | Kampanie + szablony + 2 automatyzacje |
| **Business** (599 PLN) | 599 PLN | 10 000 | 1 000 | 10 aktywnych | ✅ pełne | Pełny CRM |
| **Enterprise** (1 500 PLN+) | custom | ∞ | ∞ | ∞ | ✅ pełne | Pełny CRM + priorytet |

**Uzasadnienie:**
- Starter nie ma `sms_notifications` w feature flags (zgodnie z istniejącą konfiguracją)
- Limity email/SMS śledzone w tabeli `usage_tracking` (już istnieje) – dodajemy kolumny
- Przekroczenie limitu → błąd 402 + link do upgrade strony (`/billing/upgrade`)

### Nowe feature flags do dodania

```
'crm_campaigns'      – od Professional
'crm_automations'    – od Professional (limit_value = 2 dla Professional, 10 dla Business)
'crm_sms'            – alias sms_notifications (od Professional)
```

---

## 5. Zmiany w bazie danych

### 5.1 Migracja: wzbogacenie tabeli `clients`

```sql
-- Plik: supabase/migrations/YYYYMMDD_crm_client_fields.sql

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS last_visit_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_spent    NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS birthday       DATE,
  ADD COLUMN IF NOT EXISTS tags           TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sms_opt_in     BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email_opt_in   BOOLEAN DEFAULT TRUE;

-- Indeks do szybkiego filtrowania po dacie ostatniej wizyty
CREATE INDEX IF NOT EXISTS idx_clients_last_visit_at
  ON clients(salon_id, last_visit_at);

-- Trigger: automatyczna aktualizacja last_visit_at i total_spent
-- po INSERT/UPDATE statusu bookingu na 'completed'
-- (PL/pgSQL – szczegóły w migracji triggers)
```

### 5.2 Migracja: nowe tabele CRM

```sql
-- Plik: supabase/migrations/YYYYMMDD_crm_tables.sql

-- Szablony wiadomości
CREATE TABLE message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id    UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  subject     TEXT,                 -- tylko dla email
  body        TEXT NOT NULL,        -- treść z {{zmiennymi}}
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Kampanie / wysyłki
CREATE TABLE crm_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id        UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  template_id     UUID REFERENCES message_templates(id),
  segment_filters JSONB NOT NULL DEFAULT '{}',
  scheduled_at    TIMESTAMPTZ,       -- NULL = wyślij natychmiast; NOT NULL = zaplanowana
  sent_at         TIMESTAMPTZ,
  recipient_count INT DEFAULT 0,
  sent_count      INT DEFAULT 0,
  failed_count    INT DEFAULT 0,
  qstash_message_id TEXT,           -- ID zadania w QStash (dla anulowania)
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Logi wysyłek (per wiadomość per klient)
CREATE TABLE message_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id     UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  campaign_id  UUID REFERENCES crm_campaigns(id) ON DELETE SET NULL,
  automation_id UUID REFERENCES crm_automations(id) ON DELETE SET NULL,
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient    TEXT NOT NULL,   -- email lub numer telefonu
  subject      TEXT,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  provider_id  TEXT,            -- ID wiadomości od Resend lub SMSAPI
  error        TEXT,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Automatyzacje CRM
CREATE TABLE crm_automations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id        UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  trigger_type    TEXT NOT NULL
                  CHECK (trigger_type IN (
                    'no_visit_days',   -- brak wizyty od X dni
                    'birthday',        -- urodziny klienta
                    'after_visit',     -- X dni po wizycie
                    'visit_count'      -- po osiągnięciu N wizyt
                  )),
  trigger_config  JSONB NOT NULL DEFAULT '{}',  -- np. {"days": 30}
  channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  template_id     UUID REFERENCES message_templates(id),
  last_run_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

> **Uwaga:** `automation_id` w `message_logs` wymaga wcześniejszego CREATE TABLE `crm_automations`, więc kolejność migracji ma znaczenie lub FK dodać w drugiej migracji.

### 5.3 Migracja: trigger aktualizacji `last_visit_at`

```sql
-- Po INSERT lub UPDATE bookingu ze statusem 'completed':
-- UPDATE clients SET
--   last_visit_at = booking.start_time,
--   total_spent = total_spent + booking.price,
--   visit_count = visit_count + 1
-- WHERE id = booking.client_id
-- (triggerowany tylko gdy status zmienia się na 'completed')
```

### 5.4 Migracja: rozszerzenie `usage_tracking`

```sql
ALTER TABLE usage_tracking
  ADD COLUMN IF NOT EXISTS emails_sent_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sms_sent_count    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_limit_exceeded BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_limit_exceeded    BOOLEAN DEFAULT FALSE;
```

### 5.5 Migracja: rozszerzenie `salon_settings`

```sql
ALTER TABLE salon_settings
  ADD COLUMN IF NOT EXISTS resend_api_key       TEXT,  -- szyfrowany
  ADD COLUMN IF NOT EXISTS resend_from_email    TEXT,
  ADD COLUMN IF NOT EXISTS resend_from_name     TEXT,
  ADD COLUMN IF NOT EXISTS smsapi_token         TEXT,  -- szyfrowany
  ADD COLUMN IF NOT EXISTS smsapi_sender_name   TEXT;  -- max 11 znaków alfanumerycznych
```

> Klucze API szyfrowane po stronie aplikacji (AES-256) przed zapisem do DB.

### 5.6 RLS dla nowych tabel

| Tabela | Owner | Manager | Staff |
|---|---|---|---|
| `message_templates` | read/write/delete | read/write | read |
| `crm_campaigns` | read/write/delete | read/write | read |
| `message_logs` | read | read | — |
| `crm_automations` | read/write/delete | read | — |

---

## 6. Architektura backendu – nowe endpointy API

```
/api/crm/
├── templates/
│   ├── route.ts              GET (lista), POST (utwórz)
│   └── [id]/route.ts         GET, PUT, DELETE
│
├── campaigns/
│   ├── route.ts              GET (lista), POST (utwórz draft)
│   ├── [id]/route.ts         GET, PUT, DELETE
│   ├── [id]/send/route.ts    POST – enqueue do QStash (lub zaplanuj)
│   ├── [id]/cancel/route.ts  POST – anuluj kampanię (usuń zadanie z QStash)
│   └── [id]/stats/route.ts   GET – statystyki (sent, delivered, failed)
│
├── campaigns/worker/
│   └── route.ts              POST – worker wywoływany przez QStash per wiadomość
│
├── automations/
│   ├── route.ts              GET, POST
│   └── [id]/route.ts         GET, PUT, DELETE (+ toggle active)
│
├── segments/preview/
│   └── route.ts              POST – podgląd liczby klientów dla filtrów (real-time)
│
└── logs/
    └── route.ts              GET – historia wysyłek (paginacja, filtry)

/api/webhooks/
├── resend/route.ts           POST – statusy dostarczenia email (Resend → DB)
└── smsapi/route.ts           POST – statusy dostarczenia SMS (SMSAPI → DB)

/api/cron/
└── crm-automations/route.ts  POST – dzienny job (09:00) sprawdzający automatyzacje
```

---

## 7. Architektura kolejkowania – Upstash QStash

### Przepływ wysyłki kampanii

```
[User kliknie "Wyślij kampanię"]
        ↓
POST /api/crm/campaigns/[id]/send
        ↓
1. Pobierz klientów pasujących do segment_filters
2. Sprawdź limit email/SMS w usage_tracking (plan check)
3. Ustaw status kampanii na 'scheduled' lub 'sending'
4. Dla każdego klienta: wywołaj QStash.publishJSON({
     url: "/api/crm/campaigns/worker",
     body: { campaignId, clientId, channel },
     delay: scheduled_at ? (scheduled_at - now) : 0,
     retries: 3
   })
5. Zapisz recipient_count + qstash_message_id w crm_campaigns
        ↓
[QStash kolejkuje i wywołuje worker asynchronicznie]
        ↓
POST /api/crm/campaigns/worker  (wywołany przez QStash per klient)
        ↓
1. Pobierz dane klienta + szablon kampanii
2. Renderuj szablon (zamień {{zmienne}})
3. Sprawdź opt-in klienta
4. Wyślij email (Resend) lub SMS (SMSAPI)
5. Zapisz wynik w message_logs
6. Inkrementuj sent_count / failed_count w crm_campaigns
7. Inkrementuj emails_sent_count / sms_sent_count w usage_tracking
        ↓
[QStash retry przy błędzie – max 3 próby z exponential backoff]
```

### Konfiguracja QStash

- **Package:** `@upstash/qstash`
- **Zmienne środowiskowe:** `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
- **Weryfikacja podpisu:** Worker weryfikuje nagłówek `Upstash-Signature` (ochrona przed fałszywymi callbackami)
- **Delay dla zaplanowanych kampanii:** `delay: Math.max(0, scheduledAt - Date.now()) / 1000` (sekundy)
- **Anulowanie:** Po stronie kampanii – status `cancelled` blokuje procesowanie w workerze (worker sprawdza status przed wysyłką)

### Cron job dla automatyzacji

```
vercel.json:
{
  "crons": [
    { "path": "/api/cron/crm-automations", "schedule": "0 9 * * *" },
    ...istniejące crony...
  ]
}

Logika cronu:
1. Pobierz wszystkie aktywne automatyzacje (is_active = true)
2. Dla każdej: oblicz klientów spełniających trigger
3. Odfiltruj klientów, którym wysłano wiadomość w ostatnich X dniach
   (sprawdź message_logs wg automation_id + client_id + created_at)
4. Utwórz crm_campaign z automation_id (dla logowania)
5. Enqueue do QStash (jak kampania manualna)
6. Zaktualizuj crm_automations.last_run_at
```

---

## 8. Silnik segmentacji klientów

Filtry segmentacji przechowywane jako JSONB w `crm_campaigns.segment_filters`:

```json
{
  "lastVisitDaysBefore": 30,
  "lastVisitDaysAfter": null,
  "minVisitCount": 1,
  "maxVisitCount": null,
  "minTotalSpent": null,
  "maxTotalSpent": null,
  "tags": ["vip"],
  "birthdayThisWeek": false,
  "hasEmail": true,
  "hasPhone": true,
  "smsOptIn": true,
  "emailOptIn": true
}
```

Zapytanie SQL budowane dynamicznie po stronie API – parametryzowane (brak ryzyka SQL injection).

**Gotowe segmenty (presets w UI):**
- "Śpiący klienci" – brak wizyty od 30 dni
- "Stali klienci" – 5+ wizyt
- "VIP" – wydali powyżej 1 000 zł
- "Urodziny w tym tygodniu"
- "Nowi klienci" – 1 wizyta, < 14 dni

---

## 9. System szablonów wiadomości

### Zmienne dynamiczne (syntax: `{{zmienna}}`)

| Zmienna | Opis |
|---|---|
| `{{first_name}}` | Imię klienta |
| `{{last_name}}` | Nazwisko klienta |
| `{{last_visit_date}}` | Data ostatniej wizyty (sformatowana) |
| `{{days_since_visit}}` | Liczba dni od ostatniej wizyty |
| `{{visit_count}}` | Łączna liczba wizyt |
| `{{salon_name}}` | Nazwa salonu |
| `{{salon_phone}}` | Telefon salonu |
| `{{booking_link}}` | Link do rezerwacji online |
| `{{unsubscribe_link}}` | Link do wypisania (email) |

### Przykładowe szablony startowe (seed przy onboardingu)

| Nr | Nazwa | Kanał | Wyzwalacz |
|---|---|---|---|
| 1 | "Tęsknimy za Tobą" | SMS | Automatyzacja: brak wizyty 30 dni |
| 2 | "Podziękowanie po wizycie" | Email | Automatyzacja: 1 dzień po wizycie |
| 3 | "Urodzinowa niespodzianka" | SMS | Automatyzacja: urodziny |
| 4 | "Ekskluzywna oferta dla stałych" | Email | Kampania manualna – VIP |

---

## 10. Warstwa wysyłki wiadomości

### `lib/messaging/email-sender.ts`
- `sendEmail(params: { to, subject, html, salonId, logId })` – Resend SDK
- Pobiera klucze Resend z `salon_settings` (odszyfrowane)
- Zapisuje `provider_id` (message ID Resend) w `message_logs`
- Przy błędzie: aktualizuje `message_logs.status = 'failed'`, `error = message`

### `lib/messaging/sms-sender.ts`
- `sendSms(params: { to, body, salonId, logId })` – SMSAPI REST API
- Endpoint: `POST https://api.smsapi.pl/sms.do` (format JSON)
- Nagłówek: `Authorization: Bearer {smsapi_token}`
- Pobiera token + sender name z `salon_settings`
- Zapisuje `provider_id` (ID wiadomości SMSAPI) w `message_logs`
- Formatuje numer telefonu do E.164 dla polskich numerów (prepend `+48`)

### `lib/messaging/template-renderer.ts`
- `renderTemplate(body: string, data: ClientData): string`
- Regex replace `{{zmienna}}` → wartość
- Sanitizacja outputu: escape HTML (dla email), strip HTML (dla SMS)
- Fallback dla brakujących wartości: pusty string lub placeholder

### `lib/messaging/campaign-processor.ts`
- `enqueueCampaign(campaignId, clients[])` – wstawia do QStash
- `processMessage(campaignId, clientId, channel)` – logika workera
- `checkPlanLimits(salonId, channel, count)` – sprawdzenie limitów przed enqueue

### `lib/messaging/crypto.ts`
- `encryptApiKey(plaintext: string): string` – AES-256-GCM
- `decryptApiKey(ciphertext: string): string`
- Klucz szyfrowania: zmienna środowiskowa `MESSAGING_ENCRYPTION_KEY`

---

## 11. Webhooks statusów dostarczenia

### Resend webhook – `/api/webhooks/resend/route.ts`
- Weryfikacja podpisu: nagłówek `svix-signature` (Resend używa Svix)
- Obsługiwane zdarzenia: `email.delivered`, `email.bounced`, `email.complained`
- Aktualizuje `message_logs.status` na podstawie `data.email_id` (provider_id)

### SMSAPI callback – `/api/webhooks/smsapi/route.ts`
- SMSAPI wysyła GET/POST na skonfigurowany callback URL
- Parametry: `MsgId`, `Status` (DELIVERED, UNDELIVERED, EXPIRED, etc.)
- Mapowanie statusów SMSAPI → wewnętrzne statusy systemu
- Aktualizuje `message_logs.status`

---

## 12. Frontend – zmiany w UI

### 12.1 Rozbudowa strony Klienci (`/[slug]/clients/page.tsx`)

**Nowe kolumny w tabeli:**
- Ostatnia wizyta (data + badge "X dni temu")
- Liczba wizyt
- Ikony opt-in SMS / Email

**Nowe akcje:**
- Przycisk "Wyślij wiadomość" per wiersz → modal quick-send
- Checkbox multi-select → przycisk "Wyślij do zaznaczonych (N)"
- Rozwijane filtry segmentacyjne (nad tabelą)

**Modal "Szybka wiadomość" (QuickSendModal):**
- Wybór kanału (Email / SMS) – SMS disabled jeśli plan Starter
- Wybór szablonu lub pole "wpisz własną treść"
- Podgląd wiadomości z wypełnionymi zmiennymi
- Przycisk Wyślij → `POST /api/crm/campaigns/worker` (single send)

### 12.2 Nowa podstrona: Kampanie (`/[slug]/clients/campaigns/`)

**Lista kampanii** – kolumny: Nazwa, Kanał, Status (badge), Odbiorcy, Data wysyłki, Akcje

**Kreator kampanii – wizard 3 kroki:**
1. **Segment** – filtry + live preview liczby odbiorców (debounce 500ms → `/api/crm/segments/preview`)
2. **Wiadomość** – wybór szablonu lub tworzenie inline + podgląd renderowanej wiadomości
3. **Harmonogram** – "Wyślij teraz" lub date/time picker dla `scheduled_at`

**Widok szczegółów kampanii:**
- Nagłówek: nazwa, status, daty, liczby (sent/delivered/failed)
- Tabela odbiorców z indywidualnym statusem wiadomości
- Przycisk Anuluj (jeśli status = scheduled)

### 12.3 Nowa podstrona: Szablony (`/[slug]/clients/templates/`)

- Lista szablonów z kanałem (badge: Email / SMS / Oba) i datą edycji
- Formularz tworzenia/edycji:
  - Dla SMS: `<textarea>` z licznikiem znaków (160 / 153 dla multi-part)
  - Dla Email: plain text + toolbar do wstawiania `{{zmiennych}}`
  - Podgląd na żywo

### 12.4 Nowa podstrona: Automatyzacje (`/[slug]/clients/automations/`)

- Lista automatyzacji z toggle aktywna/nieaktywna (Switch komponent)
- Badge z planem wymaganym (jeśli locked)
- Formularz:
  - Wybór wyzwalacza z konfigiem (np. slider "30 dni")
  - Wybór kanału + szablonu
  - Podsumowanie "Co X dni wyśle wiadomość do klientów, którzy nie byli od Y dni"

### 12.5 Nowa podstrona: Historia (`/[slug]/clients/messages/`)

- Tabela z paginacją (25/strona)
- Kolumny: Data, Klient, Kanał, Temat/Treść (skrócona), Status (badge), Kampania
- Filtry: kanał, status, kampania, zakres dat

### 12.6 Rozbudowa ustawień – `/[slug]/settings/integrations/`

Nowa sekcja "Marketing i komunikacja":
- **Email (Resend):** API Key (masked), Email nadawcy, Nazwa nadawcy, przycisk "Wyślij testowy email"
- **SMS (SMSAPI):** Token (masked), Nazwa nadawcy (max 11 znaków), przycisk "Wyślij testowy SMS"
- Komunikat: "SMS dostępny od planu Professional" (locked dla Starter)

### 12.7 Banner limitów

W sekcji Kampanie / Historia: progress bar pokazujący zużycie miesięcznego limitu:
- "Email: 1 234 / 2 000 wysłanych w tym miesiącu"
- "SMS: 87 / 200 wysłanych w tym miesiącu"
- Link "Zwiększ limit → Zmień plan" gdy > 80%

---

## 13. Nawigacja

Rozbudowa sidebara – podmenu sekcji Klienci:

```
Klienci
├── Lista klientów      (istniejące)
├── Kampanie            (nowe – Professional+)
├── Szablony            (nowe – Professional+)
├── Automatyzacje       (nowe – Professional+)
└── Historia wiadomości (nowe – Professional+)
```

Elementy menu zablokowane planem Starter: widoczne ale z ikoną kłódki i tooltipem "Dostępne od planu Professional".

---

## 14. Feature gating – integracja z istniejącym systemem

Używamy istniejącego `lib/middleware/feature-gate.ts` + `checkFeatureAccess()`:

| Akcja | Wymagana feature | Minimalni plan |
|---|---|---|
| Quick-send email | `email_notifications` | Starter |
| Quick-send SMS | `sms_notifications` | Professional |
| Tworzenie kampanii | `crm_campaigns` (nowa) | Professional |
| Tworzenie automatyzacji | `crm_automations` (nowa) | Professional |
| Limity wiadomości | sprawdzane w `usage_tracking` | — |

Nowe feature flags do wstawienia w migracji (per salon, na podstawie planu):
```sql
-- crm_campaigns: enabled od Professional
-- crm_automations: enabled od Professional, limit_value = 2 (Prof), 10 (Business), NULL (Enterprise)
```

---

## 15. Kolejność implementacji (etapy)

### Etap 1 – Fundament DB i konfiguracja (prerequisite)
1. Migracja: nowe pola w `clients` + trigger `last_visit_at` / `total_spent`
2. Migracja: tabele `message_templates`, `crm_campaigns`, `message_logs`, `crm_automations`
3. Migracja: kolumny `emails_sent_count`, `sms_sent_count` w `usage_tracking`
4. Migracja: kolumny `resend_*`, `smsapi_*` w `salon_settings`
5. Migracja: nowe feature flags (`crm_campaigns`, `crm_automations`) + RLS
6. Zmienne środowiskowe: `QSTASH_TOKEN`, `QSTASH_*_SIGNING_KEY`, `MESSAGING_ENCRYPTION_KEY`

### Etap 2 – Warstwa wysyłki i integracje
1. `lib/messaging/crypto.ts` – szyfrowanie kluczy API
2. `lib/messaging/email-sender.ts` – Resend
3. `lib/messaging/sms-sender.ts` – SMSAPI
4. `lib/messaging/template-renderer.ts`
5. UI ustawień integracji (Resend + SMSAPI) z przyciskami "Testuj"
6. Webhook Resend + SMSAPI callback

### Etap 3 – Szablony i quick-send
1. API: `/api/crm/templates/` (CRUD)
2. UI: strona Szablony
3. Seed: 4 przykładowe szablony startowe
4. QuickSendModal na stronie Klientów (wyślij do 1 klienta)
5. Rozbudowa kolumn tabeli klientów (last_visit_at, visit_count, opt-in)

### Etap 4 – Kampanie z QStash
1. `lib/messaging/campaign-processor.ts` + limit check
2. API: `/api/crm/segments/preview/`
3. API: `/api/crm/campaigns/` (CRUD + send + cancel)
4. API: `/api/crm/campaigns/worker/` (QStash worker z weryfikacją podpisu)
5. UI: strona Kampanie z wizardem

### Etap 5 – Historia i monitoring
1. API: `/api/crm/logs/`
2. UI: strona Historia wiadomości
3. UI: banner limitów (progress bar)
4. Widok szczegółów klienta – zakładka Historia komunikacji

### Etap 6 – Automatyzacje
1. API: `/api/crm/automations/` (CRUD)
2. API: `/api/cron/crm-automations/` + `vercel.json` cron
3. UI: strona Automatyzacje z togglem i wizardem

---

## 16. Wymagania niefunkcjonalne

| Wymaganie | Rozwiązanie |
|---|---|
| Bezpieczeństwo kluczy API | AES-256-GCM (`lib/messaging/crypto.ts`) przed zapisem do DB |
| Opt-out klientów | `sms_opt_in`, `email_opt_in`; link unsubscribe w każdym emailu; worker sprawdza przed wysyłką |
| Ochrona workera QStash | Weryfikacja `Upstash-Signature` w nagłówku requestu |
| Rate limiting wysyłki | QStash kontroluje przepustowość; 1 wiadomość per job |
| Duplikaty automatyzacji | Sprawdzenie `message_logs` przed enqueue (deduplikacja wg client+automation+okno czasowe) |
| RODO | Opt-in per kanał; soft-delete klientów usuwa message_logs; eksport historii |
| Monitoring błędów | Sentry (już skonfigurowany) – capture exceptions w worker |
| Uprawnienia | Owner + Manager mogą wysyłać/tworzyć; Staff tylko podgląd historii |
| Plan enforcement | `checkFeatureAccess()` w każdym API route CRM; `usage_tracking` dla limitów ilościowych |

---

## 17. Zależności zewnętrzne do instalacji

```bash
# Email
npm install resend

# SMS (SMSAPI – brak dedykowanego SDK, używamy natywnego fetch)
# Brak dodatkowych packages

# QStash – kolejkowanie kampanii
npm install @upstash/qstash

# Opcjonalnie: szyfrowanie (jeśli nie chcemy implementować własnego)
npm install @noble/ciphers
# lub użyć wbudowanego Node.js crypto (brak dodatkowych deps)
```

---

## 18. Zmienne środowiskowe do dodania

```env
# Resend
RESEND_API_KEY=re_...            # fallback (salony mogą mieć własne)

# Upstash QStash
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...

# Szyfrowanie kluczy API klientów w DB
MESSAGING_ENCRYPTION_KEY=...    # 32-bajtowy losowy klucz (hex lub base64)

# SMSAPI (opcjonalnie jako fallback – salony mają własne tokeny)
# SMSAPI_TOKEN=...
```

---

## 19. Otwarte pytania / decyzje do podjęcia

1. **Szablony email:** plain text wystarczy, czy potrzebny edytor HTML/WYSIWYG? (TipTap, Quill, React Email)
2. **Podgląd emaila:** renderować jako HTML iframe w kreatorze kampanii?
3. **Rejestracja nadawcy SMS:** SMSAPI wymaga zatwierdzenia nazwy nadawcy – salony muszą przejść ten proces samodzielnie; dodać instrukcję w UI?
4. **Limity QStash:** darmowy tier QStash to 500 wiadomości/dzień – przy większych kampaniach wymagany płatny plan Upstash
5. **Multi-salon (Business+):** czy CRM ma działać per-salon niezależnie (tak – RLS gwarantuje izolację)?
