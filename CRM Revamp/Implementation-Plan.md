# Plan Wdrożenia – SimpliSalon CRM Revamp

> Dokument oparty na „Raporcie Architektoniczno-Strategicznym" (`Plan.md`).  
> Priorytety: **A → B** (Kategoria C jest odrzucona lub przełożona w nieskończoność).

---

## 0. Architektura systemu – przegląd

```
SimpliSalon (Next.js / TypeScript)
├── Supabase (PostgreSQL + Auth + Storage)
│   ├── Tabele CRM (clients, bookings, employees, services…)
│   ├── Tabele nowe wg faz wdrożenia
│   └── CRON jobs (pg_cron lub Vercel Cron)
├── Vercel (hosting + API routes)
├── Twilio / SMSAPI / BulkGate (SMS)
├── Przelewy24 (płatności B2B)
└── Google Calendar (istniejąca integracja)
```

Każda faza wdrożenia obejmuje:
1. **Migrację bazy danych** (schemat SQL)
2. **Backend** (API routes w Next.js)
3. **Frontend** (komponenty React)
4. **Testy** (jednostkowe + E2E + manualne)

---

## FAZA 0 – Infrastruktura Płatnicza B2B (Przelewy24)

> **Priorytet:** Krytyczny – bez tego nie ma stabilnego SaaS.  
> **Trudność:** 5/10

### 0.1 Baza danych

```sql
-- Subskrypcje salonów
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'basic',        -- basic | pro | enterprise
  status TEXT NOT NULL DEFAULT 'active',     -- active | past_due | canceled | trialing
  p24_token TEXT,                            -- tokenizowany identyfikator karty
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Historia faktur
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  amount_pln NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | paid | failed
  p24_order_id TEXT,
  invoice_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Portmonetka SMS (przedpłacona)
CREATE TABLE sms_wallet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID REFERENCES salons(id) ON DELETE CASCADE UNIQUE,
  balance_sms INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 0.2 Backend – API Routes

| Endpoint | Metoda | Opis |
|---|---|---|
| `/api/billing/subscribe` | POST | Inicjuje nową subskrypcję, rejestruje token karty w Przelewy24 |
| `/api/billing/webhook` | POST | Webhook Przelewy24 – zmienia status faktury/subskrypcji |
| `/api/billing/invoices` | GET | Lista faktur dla zalogowanego salonu |
| `/api/billing/sms-topup` | POST | Doładowanie portmonetki SMS przez Przelewy24 |
| `/api/billing/cancel` | POST | Anulowanie subskrypcji (maszyna stanów) |

**Maszyna stanów subskrypcji:**
```
trialing → active → past_due → canceled
                  ↑___________|  (dunning: 3 próby co 3 dni)
```

### 0.3 Frontend

- **Strona `/settings/billing`**: aktualne plan, saldo SMS, historia faktur (PDF), przycisk zmiany planu.
- **Doładowanie SMS**: przycisk „Kup pakiet SMS" → modal z kwotami → redirect do Przelewy24 → webhook → aktualizacja salda.
- **Banner** informujący o statusie `past_due` widoczny globalnie.

### 0.4 Testowanie

| Typ | Kroki |
|---|---|
| **Jednostkowy** | Logika dunning process (retry co 3 dni × 3), zmiana stanów subskrypcji. |
| **E2E (Playwright)** | Przejście przez checkout Przelewy24 (środowisko sandbox). |
| **Manualny** | Weryfikacja PDF faktury, aktualizacja salda SMS po doładowaniu. |

---

## FAZA 1 – Wielowymiarowa Rezerwacja Zasobów (Sprzęt i Maszyny)

> **Priorytet:** Bardzo wysoki – fundament architektoniczny.  
> **Trudność:** 8/10

### 1.1 Baza danych – restrukturyzacja kalendarza

```sql
-- Encja maszyn/sprzętu
CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                        -- np. "Fotel podologiczny #1"
  type TEXT,                                 -- laser | fotel | stół_manicure | inne
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Relacja Usługa ↔ Wymagany sprzęt (wiele-do-wielu)
CREATE TABLE service_equipment (
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, equipment_id)
);

-- Rezerwacja dostępności sprzętu (blokada czasowa)
CREATE TABLE equipment_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  EXCLUDE USING gist (
    equipment_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  )  -- zapobiega nakładaniu się rezerwacji sprzętowych
);
```

> **Ważne:** Index i constraint `EXCLUDE USING gist` wymaga rozszerzenia `btree_gist` w Supabase (`CREATE EXTENSION IF NOT EXISTS btree_gist;`).

### 1.2 Logika walidacji dostępności

Przed zapisem rezerwacji API musi sprawdzić **jednocześnie**:
1. Dostępność pracownika (brak nakładania się w tabeli `bookings`).
2. Dostępność wymaganego sprzętu (brak nakładania się w `equipment_bookings`).

```typescript
// lib/availability.ts
export async function checkAvailability(
  employeeId: string,
  equipmentIds: string[],
  start: Date,
  end: Date
): Promise<{ available: boolean; conflict?: string }> { ... }
```

Jeśli którykolwiek warunek jest niespełniony → błąd 409 z opisem konfliktu.

### 1.3 Backend

| Endpoint | Metoda | Opis |
|---|---|---|
| `/api/equipment` | GET/POST | Lista i tworzenie sprzętu |
| `/api/equipment/[id]` | PUT/DELETE | Edycja/usunięcie |
| `/api/bookings` | POST (zmiana) | Walidacja sprzętu przed zapisem |
| `/api/availability` | GET | Zwraca wolne sloty z uwzględnieniem sprzętu |

### 1.4 Frontend

- **Panel `/settings/equipment`**: CRUD sprzętu (lista, dodaj, edytuj, usuń).
- **Formularz usługi**: checkbox do przypisania wymaganego sprzętu.
- **Kalendarz**: wizualne oznaczenie slotów zablokowanych przez sprzęt.
- **Drag & drop bloków czasowych**: przeciągnięcie → automatyczna rewalidacja dostępności sprzętu i pracownika.

### 1.5 Testowanie

| Typ | Kroki |
|---|---|
| **Jednostkowy** | `checkAvailability`: 4 scenariusze – brak konfliktu, konflikt pracownika, konflikt sprzętu, oba konflikty. |
| **Integracyjny** | Próba zapisu nakładającej się rezerwacji → oczekiwany błąd 409 z DB (`EXCLUDE` constraint). |
| **E2E** | Zarezerwuj usługę na sprzęt → spróbuj zarezerwować tę samą godzinę na ten sam sprzęt → potwierdź blokadę. |
| **Manualny** | Zmień godziny pracownika → sprawdź, czy rezerwacje sprzętowe nie ucierpiały. |

---

## FAZA 2 – Moduł Medycznych Kart Zabiegowych i Beauty Planów

> **Priorytet:** Najwyższy sprzedażowo – eliminuje BeautyCheck (150–349 PLN/mc).  
> **Trudność:** 6/10

### 2.1 Baza danych

```sql
-- Szablony formularzy (kreator form builder)
CREATE TABLE form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                        -- np. "Ankieta przed kwasem medycznym"
  fields JSONB NOT NULL DEFAULT '[]',       -- definicja pól (typ, label, wymagane)
  requires_signature BOOLEAN DEFAULT false,
  gdpr_consent_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Przypisanie szablonu do usługi
CREATE TABLE service_forms (
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  form_template_id UUID REFERENCES form_templates(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, form_template_id)
);

-- Wypełnione formularze klientów
CREATE TABLE client_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id),
  form_template_id UUID REFERENCES form_templates(id),
  answers JSONB NOT NULL DEFAULT '{}',      -- odpowiedzi w JSONB
  signature_url TEXT,                       -- URL do podpisu w Supabase Storage
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Beauty plany (multi-zabiegi w czasie)
CREATE TABLE beauty_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE beauty_plan_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES beauty_plans(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id),
  booking_id UUID REFERENCES bookings(id),  -- NULL = planowany, nie umówiony
  planned_date DATE,
  notes TEXT,
  step_order INT NOT NULL
);
```

**RODO:** Kolumny `answers`, `signature_url` w `client_forms` szyfrowane po stronie aplikacji (np. `pgcrypto` lub szyfrowanie AES po stronie Next.js przed zapisem).

### 2.2 Form Builder – architektura pól JSONB

```jsonc
// Przykładowa struktura pola w fields[]
{
  "id": "q1",
  "type": "text" | "textarea" | "checkbox" | "select" | "date" | "signature",
  "label": "Czy pacjentka ma alergie?",
  "required": true,
  "options": ["Tak", "Nie", "Nie wiem"]   // tylko dla type=select
}
```

### 2.3 Backend

| Endpoint | Metoda | Opis |
|---|---|---|
| `/api/forms/templates` | GET/POST | Kreator formularzy |
| `/api/forms/templates/[id]` | PUT/DELETE | Edycja/usunięcie szablonu |
| `/api/forms/public/[token]` | GET | Publiczny link do wypełnienia (bez auth) |
| `/api/forms/submit/[token]` | POST | Zapis odpowiedzi klienta |
| `/api/forms/client/[clientId]` | GET | Historia formularzy klienta w CRM |
| `/api/beauty-plans` | GET/POST | Beauty plany |
| `/api/beauty-plans/[id]` | GET/PUT/DELETE | Szczegóły planu |

**Generowanie tokenizowanego linku:**
```
/forms/fill/{jwt_token}
```
JWT zawiera `{ formTemplateId, clientId, bookingId, exp: +72h }`.

### 2.4 Frontend

- **Panel `/settings/forms`**: lista szablonów, kreator drag-and-drop pól.
- **Widok klienta w CRM**: zakładka „Karty medyczne" z listą wypełnionych formularzy.
- **Podgląd PDF**: generowanie (np. `@react-pdf/renderer`) do druku lub archiwum.
- **Podpis cyfrowy**: biblioteka `signature_pad` na tablecie/telefonie.
- **Beauty plan**: zakładka w karcie klienta z wizją osi czasu zabiegów.

### 2.5 Testowanie

| Typ | Kroki |
|---|---|
| **Jednostkowy** | Walidacja tokenu JWT (wygaśnięcie, tampering). |
| **E2E** | Tworzenie szablonu → przypisanie do usługi → booking → wysyłka linku SMS → wypełnienie formularza → podpis → zapis → widok w CRM. |
| **RODO** | Weryfikacja szyfrowania: pole `answers` w bazie powinno być nieczytelne bez klucza deszyfrującego. |
| **Manualny** | Generowanie PDF podpisanej karty, weryfikacja podpisu na ekranie. |

---

## FAZA 3 – Zaawansowana Komunikacja SMS (Dwukierunkowy Czat + Przypominajki)

> **Priorytet:** Wysoki retencyjnie – „Czarna Lista" jako pakiet.  
> **Trudność:** 5/10 (jednostronne) / 7/10 (dwukierunkowe)  
> **Monetyzacja:** Portmonetka SMS z Fazy 0.

### 3.1 Baza danych

```sql
-- Wiadomości SMS (historia czatu) 
CREATE TABLE sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  body TEXT NOT NULL,
  status TEXT DEFAULT 'queued',              -- queued | sent | delivered | failed
  provider_message_id TEXT,                 -- ID z SMSAPI/BulkGate
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Konfiguracja przypomnień per salon
CREATE TABLE reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
  hours_before INT NOT NULL,                -- np. 24, 3
  message_template TEXT NOT NULL,
  target_blacklisted_only BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true
);
```

### 3.2 Przypomnienia – architektura CRON

```
Vercel Cron (co 15 minut) → /api/cron/reminders
  └── Pobierz wizyty startujące za X godzin
  └── Sprawdź regułę ReminderRules
  └── Generuj link potwierdzający: /confirm/{jwt_token}
  └── Wyślij SMS przez SMSAPI/BulkGate
  └── Zapisz w sms_messages + odejmij saldo z sms_wallet
```

**Link potwierdzający:**
```
GET /api/bookings/confirm/{jwt}?action=confirm|cancel
→ aktualizuje booking.status
→ wyświetla stronę potwierdzenia
```

### 3.3 Czat dwukierunkowy (2-way SMS)

1. SMSAPI/BulkGate → Webhook → **`POST /api/sms/webhook`**
2. Endpoint zapisuje do `sms_messages` (direction: `inbound`)
3. Supabase Realtime (`LISTEN`) → aktualizacja UI w czasie rzeczywistym (bez polingu)

### 3.4 Backend

| Endpoint | Metoda | Opis |
|---|---|---|
| `/api/sms/send` | POST | Wyślij SMS (odejmuje z portmonetki) |
| `/api/sms/webhook` | POST | Odbiera przychodzące SMS od dostawcy |
| `/api/sms/history/[clientId]` | GET | Historia czatu z klientem |
| `/api/bookings/confirm/[token]` | GET | Potwierdzenie/anulowanie przez klienta |
| `/api/cron/reminders` | GET | Cron wysyłający przypomnienia |
| `/api/settings/sms` | GET/PUT | Konfiguracja dostawcy i reguł |

### 3.5 Frontend

- **Widok klienta w CRM**: zakładka „SMS" – czat inline (Supabase Realtime).
- **Panel `/settings/sms`**: wybór dostawcy (SMSAPI/BulkGate), klucz API, reguły przypomnień.
- **Saldo SMS**: widoczne w nagłówku/sidebar z przyciskiem doładowania.
- **Kampanie „Złote Terminy"**: filtr klientów (np. nieobecni >90 dni) → masowa wysyłka SMS z last-minute ofertą.

### 3.6 Testowanie

| Typ | Kroki |
|---|---|
| **Jednostkowy** | Logika dedukowania salda SMS (nie zejdź poniżej 0). |
| **Integracyjny** | Webhook SMSAPI sandbox → zapis do `sms_messages` → Realtime update. |
| **E2E** | Booking → cron → SMS z linkiem → kliknięcie „Potwierdź" → `booking.status = confirmed`. |
| **Manualny** | Ręczne wysłanie SMS z czatu CRM → sprawdzenie doręczenia w panelu dostawcy. |

---

## FAZA 4 – Moduł CRM: Czarna Lista i Behawioralny Scoring

> **Priorytet:** Wysoki retencyjnie.  
> **Trudność:** 3/10

### 4.1 Baza danych

```sql
-- Rozszerzenie tabeli clients
ALTER TABLE clients
  ADD COLUMN blacklist_status TEXT DEFAULT 'clean'  -- clean | warned | blacklisted
    CHECK (blacklist_status IN ('clean', 'warned', 'blacklisted')),
  ADD COLUMN no_show_count INT DEFAULT 0,
  ADD COLUMN blacklisted_at TIMESTAMPTZ,
  ADD COLUMN blacklist_reason TEXT;

-- Opcjonalna tabela historii naruszeń
CREATE TABLE client_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id),
  violation_type TEXT NOT NULL,  -- no_show | late_cancel
  occurred_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.2 Logika CRON scoringu

```
Vercel Cron (codziennie 02:00) → /api/cron/blacklist-scoring
  └── Pobierz wszystkie bookings ze statusem 'no_show' z ostatnich 6 miesięcy
  └── Grupuj per client_id → zlicz
  └── Jeśli no_show_count >= PROROG:
        UPDATE clients SET blacklist_status = 'blacklisted', blacklisted_at = now()
  └── Notify: dashboard + opcjonalny SMS do salonu
```

**Domyślny próg:** 2 no-show w ciągu 6 miesięcy (konfigurowalne per salon w ustawieniach).

### 4.3 Blokada rezerwacji online

W procesie rezerwacji online (booking flow):
```typescript
const client = await getClientByPhone(phone);
if (client?.blacklist_status === 'blacklisted') {
  return { error: 'BLACKLISTED', message: 'Prosimy o kontakt telefoniczny z salonem.' };
}
```

### 4.4 Frontend

- **Karta klienta w CRM**: badge „⚠️ Czarna Lista" z datą i liczbą no-show.
- **Akcja manualna**: możliwość ręcznego dodania/usunięcia z czarnej listy (z powodem).
- **Ustawienia (`/settings/crm`)**: próg no-show, okno czasowe (np. 3/6/12 miesięcy).
- **Filtr w liście klientów**: zakładka „Czarna lista".

### 4.5 Testowanie

| Typ | Kroki |
|---|---|
| **Jednostkowy** | Logika scoringu: 0/1/2/3 no-show + różne okna czasowe. |
| **Integracyjny** | CRON → klient z 2 no-show → blacklist_status = 'blacklisted'. |
| **E2E** | Klient na czarnej liście próbuje zarezerwować online → blokada z komunikatem. |
| **Manualny** | Ręczne dodanie do listy, weryfikacja blokady bookingu online. |

---

## FAZA 5 – Ankiety po Wizycie i Raportowanie Dochodowości

> **Priorytet:** Średni (domknięcie prezentacji handlowej).  
> **Trudność:** 4/10

### 5.1 Baza danych

```sql
-- Ankiety zadowolenia po wizycie
CREATE TABLE satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE UNIQUE,
  client_id UUID REFERENCES clients(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  nps_score INT CHECK (nps_score BETWEEN 0 AND 10),
  comment TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 5.2 Backend – wysyłka i raportowanie

| Endpoint | Metoda | Opis |
|---|---|---|
| `/api/cron/surveys` | GET | Cron (2h po bookingu) → generuje token → wysyła SMS |
| `/api/surveys/fill/[token]` | GET | Publiczna strona ankiety |
| `/api/surveys/submit/[token]` | POST | Zapis odpowiedzi |
| `/api/reports/revenue` | GET | Raport przychodów (filtr: przedział dat, pracownik, usługa) |
| `/api/reports/nps` | GET | Raport NPS (średnia, trend) |
| `/api/reports/top-services` | GET | Ranking usług wg zysku i retencji |

### 5.3 Frontend

- **Dashboard**: widgety NPS, przychód tygodniowy, TOP 5 usług.
- **Strona `/reports`**: wykresy (Chart.js/Recharts), eksport CSV.
- **Publiczna strona ankiety** (`/survey/{token}`): prosta, mobilna strona z gwiazdkami i polem komentarza.

### 5.4 Testowanie

| Typ | Kroki |
|---|---|
| **Jednostkowy** | Kalkulacja NPS z przykładowego zestawu odpowiedzi. |
| **E2E** | Zakończony booking → CRON → SMS z linkiem → wypełnienie ankiety → dashboard z wynikami. |
| **Manualny** | Weryfikacja wykresu, eksport CSV z danymi. |

---

## Kolejność Wdrożenia – Podsumowanie

| # | Faza | Priorytet | Trudność | Szacowany czas |
|---|---|---|---|---|
| 0 | Infrastruktura Płatnicza (Przelewy24) | 🔴 Krytyczny | 5/10 | 2–3 tygodnie |
| 1 | Wielowymiarowa Rezerwacja Sprzętu | 🔴 Bardzo wysoki | 8/10 | 3–4 tygodnie |
| 2 | Medyczne Karty i Beauty Plany | 🟠 Najwyższy sprzedażowy | 6/10 | 3–4 tygodnie |
| 3 | SMS Dwukierunkowy + Przypomnienia | 🟡 Wysoki retencyjny | 5–7/10 | 2–3 tygodnie |
| 4 | Czarna Lista CRM | 🟡 Wysoki retencyjny | 3/10 | 1 tydzień |
| 5 | Ankiety + Raporty Dochodowości | 🟢 Średni | 4/10 | 1–2 tygodnie |

> **Wykluczone** (Kategoria C z Planu.md):
> - ❌ Voicebot AI (10/10 trudności, zerowy ROI na tym etapie)
> - ❌ Mikro-kosztorysowanie COGS/magazyn (próg UX za wysoki)
> - ❌ Automatyzacja na Facebook/Instagram (blokady Meta API)
> - ❌ Posprzedażowe SMS e-commerce (ryzyko spamu)

---

## Ogólne Zasady Testowania Między Fazami

1. **Przed merge każdej fazy:** uruchomić `npm run build` i `npm run test` (testy jednostkowe).
2. **Migracje DB:** stosować tylko przez narzędzie Supabase CLI (`supabase db push`) – nigdy ręcznie na produkcji.
3. **Feature flags:** każda faza może być ukryta za flagą w `settings` tabeli salonu (`features JSONB`), aby wdrażać stopniowo per klient.
4. **Środowisko staging:** testować całość na osobnym projekcie Supabase + Vercel preview branch przed pushem na `main`.
5. **Sentry / logging:** upewnić się, że każdy nowy endpoint loguje błędy do Sentry z kontekstem `salon_id`.

---

## Przykładowy Feature Flag (dla stopniowego rollout)

```sql
ALTER TABLE salons ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}';

-- Aktywacja fazy 2 dla konkretnego salonu:
UPDATE salons 
SET features = features || '{"medical_forms": true}'
WHERE id = '{salon_id}';
```

```typescript
// lib/features.ts
export function hasFeature(salon: Salon, feature: string): boolean {
  return salon.features?.[feature] === true;
}
```
