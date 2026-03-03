# Sprint 08 – Ankiety po Wizycie i Raporty Dochodowości

> **Typ:** Backend (CRON) + DB + Frontend (Dashboard)  
> **Wymaga:** Sprint 00 (CRON guard), Sprint 06 (SMS send)  
> **Szacowany czas:** 1–2 tygodnie  
> **Trudność:** 4/10  
> **Priorytet:** 🟢 Średni – domknięcie prezentacji handlowej

---

## 📎 Pliki do kontekstu Gemini

> Plik sprintu + Sprint-00 + Sprint-06 (sendSms) + poniższe pliki.

**Istniejące pliki do MODYFIKACJI:**
- `app/api/bookings/route.ts` – dodajesz ustawienie `survey_sent = false` przy tworzeniu nowego bookingu
- `app/api/bookings/[id]/route.ts` – dodajesz ustawienie `survey_sent = true` + uruchomienie CRON przy zmianie na `completed`
- `app/(dashboard)/[slug]/reports/` – sprawdź co już istnieje w tym folderze (jest w strukturze)
- `lib/messaging/sms-sender.ts` – używasz `sendSms` do wysyłki linku do ankiety

**Nie istnieją jeszcze – stworzysz je w tym sprincie:**
- `app/api/cron/surveys/route.ts` ← CRON wysyłający ankiety 2h po wizycie
- `app/api/surveys/fill/[token]/route.ts` ← publiczny endpoint ankiety
- `app/api/surveys/submit/[token]/route.ts` ← zapis odpowiedzi
- `app/api/reports/nps/route.ts` ← raport NPS
- `app/api/reports/revenue/route.ts` ← raport przychodu
- `app/api/reports/top-services/route.ts` ← ranking usług
- `app/survey/[token]/page.tsx` ← publiczna strona ankiety (poza layoutem dashboard)

**Wzorce:**
- `lib/supabase/admin.ts` – do CRON (poza RLS)
- `lib/forms/token.ts` – wzorzec JWT z Sprint-04; użyj analogicznego `generateSurveyToken`

---

## Cel sprintu

Automatyczne zbieranie NPS po każdej wizycie (SMS z linkiem do ankiety) oraz analityczny dashboard dla właściciela salonu: przychody, NPS, TOP usługi i pracownicy. Ostatni sprint – nie może powodować regresji w żadnym wcześniejszym obszarze.

---

## 8.1 Migracja bazy danych

> Plik: `supabase/migrations/20260331_surveys_reports.sql`

```sql
-- Ankiety zadowolenia po wizycie
CREATE TABLE satisfaction_surveys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id)  ON DELETE CASCADE UNIQUE,
  client_id    UUID NOT NULL REFERENCES clients(id)   ON DELETE CASCADE,
  salon_id     UUID NOT NULL REFERENCES salons(id)    ON DELETE CASCADE,
  rating       INT  CHECK (rating BETWEEN 1 AND 5),
  nps_score    INT  CHECK (nps_score BETWEEN 0 AND 10),
  comment      TEXT,
  fill_token   TEXT UNIQUE,
  fill_token_exp TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_surveys_salon_date ON satisfaction_surveys(salon_id, submitted_at DESC);
CREATE INDEX idx_surveys_client ON satisfaction_surveys(client_id);

ALTER TABLE satisfaction_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salon_read_surveys" ON satisfaction_surveys FOR SELECT USING (
  salon_id = (SELECT salon_id FROM employees WHERE user_id = auth.uid() LIMIT 1)
);
```

---

## 8.2 CRON – wysyłka ankiet po wizycie

> `GET /api/cron/surveys` (Vercel Cron: `*/30 * * * *`)

```typescript
export async function GET(req: NextRequest) {
  validateCronRequest(req);
  
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
  const twoHoursThirtyAgo = new Date(now.getTime() - 2.5 * 3600 * 1000);
  
  // Bookings ukończone ~2h temu z salonu z aktywnym surveys
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, clients(*), salons(features)')
    .eq('status', 'completed')
    .gte('ends_at', twoHoursThirtyAgo.toISOString())
    .lte('ends_at', twoHoursAgo.toISOString())
    .is('survey_sent', false);   // zabezpieczenie przed duplikacją
  
  for (const booking of bookings ?? []) {
    if (!hasFeature(booking.salons.features, 'surveys')) continue;
    
    // Utwórz ankietę (bez odpowiedzi na razie)
    const token = generateSurveyToken({ bookingId: booking.id, salonId: booking.salon_id });
    await supabase.from('satisfaction_surveys').insert({
      booking_id: booking.id,
      client_id: booking.client_id,
      salon_id: booking.salon_id,
      fill_token: token,
      fill_token_exp: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
    });
    
    // Wyślij SMS
    const surveyUrl = `${process.env.APP_URL}/survey/${token}`;
    await sendSms({
      to: booking.clients.phone,
      body: `Dziękujemy za wizytę! Oceń nas w 30 sekund: ${surveyUrl}`,
      salonId: booking.salon_id,
      clientId: booking.client_id,
    });
    
    await supabase.from('bookings').update({ survey_sent: true }).eq('id', booking.id);
  }
}
```

Dodaj kolumnę: `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS survey_sent BOOLEAN DEFAULT false;`

---

## 8.3 API Routes – Ankiety

| Endpoint | Metoda | Auth | Opis |
|---|---|---|---|
| `/api/cron/surveys` | GET | CRON | Wysyłka ankiet po wizycie |
| `/api/surveys/fill/[token]` | GET | publiczny | Dane do wyświetlenia ankiety |
| `/api/surveys/submit/[token]` | POST | publiczny | Zapis odpowiedzi |
| `/api/reports/nps` | GET | owner/manager | Raport NPS (average, trend, komentarze) |
| `/api/reports/revenue` | GET | owner/manager | Raport przychodów |
| `/api/reports/top-services` | GET | owner/manager | TOP usługi wg przychodu i liczby |
| `/api/reports/top-employees` | GET | owner/manager | TOP pracownicy wg sprzedaży |

---

## 8.4 Raporty – zapytania SQL

### Raport NPS

```sql
-- Średni NPS salonu w danym przedziale
SELECT 
  ROUND(AVG(nps_score)::numeric, 1) AS avg_nps,
  COUNT(*) AS total_responses,
  COUNT(*) FILTER (WHERE nps_score >= 9) AS promoters,
  COUNT(*) FILTER (WHERE nps_score BETWEEN 7 AND 8) AS passives,
  COUNT(*) FILTER (WHERE nps_score <= 6) AS detractors,
  ROUND(
    (COUNT(*) FILTER (WHERE nps_score >= 9) - COUNT(*) FILTER (WHERE nps_score <= 6))::numeric 
    / COUNT(*) * 100, 1
  ) AS nps_score
FROM satisfaction_surveys
WHERE salon_id = $1
  AND submitted_at BETWEEN $2 AND $3;
```

### Raport TOP usług

```sql
SELECT 
  s.name AS service_name,
  COUNT(b.id) AS booking_count,
  SUM(b.price) AS total_revenue,
  ROUND(AVG(ss.rating)::numeric, 1) AS avg_rating,
  ROUND(
    COUNT(DISTINCT b.client_id)::numeric / COUNT(b.id) * 100, 1
  ) AS retention_rate
FROM bookings b
JOIN services s ON s.id = b.service_id
LEFT JOIN satisfaction_surveys ss ON ss.booking_id = b.id
WHERE b.salon_id = $1
  AND b.status = 'completed'
  AND b.starts_at BETWEEN $2 AND $3
GROUP BY s.id, s.name
ORDER BY total_revenue DESC
LIMIT 10;
```

### Raport TOP pracowników

```sql
SELECT 
  e.first_name || ' ' || e.last_name AS employee_name,
  COUNT(b.id) AS bookings_count,
  SUM(b.price) AS revenue,
  SUM(b.price * COALESCE(e.commission_rate, 0) / 100) AS commission_earned
FROM bookings b
JOIN employees e ON e.id = b.employee_id
WHERE b.salon_id = $1
  AND b.status = 'completed'
  AND b.starts_at BETWEEN $2 AND $3
GROUP BY e.id, e.first_name, e.last_name, e.commission_rate
ORDER BY revenue DESC;
```

---

## 8.5 Frontend – Publiczna strona ankiety

> Ścieżka: `src/app/survey/[token]/page.tsx`  
> **Strona publiczna** (bez layoutu dashboardu, responsywna)

```typescript
// Struktura strony:
// 1. Logo salonu + "Jak oceniasz dzisiejszą wizytę?"
// 2. Gwiazdki 1–5 (duże, klikalne)
// 3. NPS: "Czy polecisz nas znajomym?" (skala 0–10 z opisami)
// 4. Pole tekstowe (opcjonalne): "Co moglibyśmy zrobić lepiej?"
// 5. Przycisk "Prześlij ocenę"
// 6. Po wysłaniu: "Dziękujemy! Twoja opinia jest dla nas ważna. 🙏"
```

---

## 8.6 Frontend – Dashboard analityczny

W istniejącym dashboardzie rozszerzyć widgety i dodać stronę `/reports`:

### Widgety na głównym dashboardzie

```typescript
<RevenueWidget period="week" />       // Przychód tego tygodnia vs poprzedniego
<NpsWidget />                          // Aktualny NPS (ostatnie 30 dni)
<TopServiceWidget limit={3} />         // TOP 3 usługi
```

### Strona `/reports`

**Filtry:**
- Zakres dat (date picker: ostatnie 7/30/90 dni lub custom)
- Pracownik (dropdown)
- Usługa (dropdown)

**Sekcje:**

| Sekcja | Wykres | Biblioteka |
|---|---|---|
| Przychód w czasie | Line chart (dni/tygodnie) | Recharts |
| NPS trend | Area chart | Recharts |
| TOP 10 usług | Bar chart poziomy | Recharts |
| TOP pracownicy | Tabela z progress bars | CSS |
| Ostatnie komentarze | Lista (rating + tekst) | – |

**Eksport:**
- Przycisk „Eksportuj CSV" → `GET /api/reports/revenue?format=csv`

---

## 8.7 Testowanie

### Jednostkowe

```typescript
describe('NPS calculation', () => {
  it('calculates NPS correctly: (promoters-detractors)/total*100')
  it('handles 0 responses without division by zero')
  it('filters by date range correctly')
})

describe('Survey CRON', () => {
  it('sends only to completed bookings 2h after ends_at')
  it('sets survey_sent=true to prevent duplicate sends')
  it('skips salons without surveys feature flag')
  it('does not send if client has no phone number')
})
```

### E2E (Playwright)

```typescript
test('Pełny flow ankiety po wizycie', async ({ page }) => {
  // 1. Oznacz booking jako completed
  // 2. Wywołaj CRON /api/cron/surveys
  // 3. Sprawdź że satisfaction_surveys rekord istnieje
  // 4. Otwórz /survey/{token}
  // 5. Kliknij 5 gwiazdek, NPS=10, dodaj komentarz
  // 6. Submit
  // 7. Sprawdź że satisfaction_surveys.rating=5, nps_score=10
});

test('Dashboard raportów wyświetla dane', async ({ page }) => {
  // 1. Zaloguj jako owner
  // 2. Przejdź do /reports
  // 3. Sprawdź że wykresy renderują się bez błędów
  // 4. Zmień zakres dat
  // 5. Sprawdź eksport CSV (Content-Type: text/csv)
});
```

### Testy regresji (finalne – cały system)

```bash
# Uruchom pełny suite regresji przed deployem
npx playwright test --reporter=html

# Kluczowe przepływy do walidacji:
# [ ] Login → dashboard → tworzenie bookingu
# [ ] Tworzenie klienta → booking → SMS reminder → confirm
# [ ] Kreator formularza → booking → link SMS → wypełnienie
# [ ] Billing: checkout → webhook → active subscription
# [ ] Rezerwacja z konfliktem sprzętu → 409 error
# [ ] No-show → violation → CRON → blacklist badge
```

---

## Checklist weryfikacyjna

- [ ] `satisfaction_surveys.fill_token` unieważniany po submit (jak w formach Sprint 05)
- [ ] CRON nie wysyła ankiety 2× dla tego samego bookingu (`survey_sent = true`)
- [ ] Dashboard `/reports` ładuje się w < 3s (indeksy na `salon_id + starts_at`)
- [ ] Eksport CSV działa z nagłówkami po polsku (kodowanie UTF-8 z BOM dla Excela)
- [ ] Publiczna strona ankiety działa bez cookies (Google Lighthouse mobile ≥ 90)
- [ ] Pełny suite regresji Playwright zdany
- [ ] `npm run build` bez błędów TypeScript
- [ ] Vercel preview deploy weryfikuje wszystkie 9 sprintów end-to-end

---

## To kończy plan wdrożenia CRM Revamp

➡️ Po tym sprincie wszystkie Kategorie A i B z Planu.md są wdrożone.  
📊 Powróć do [README – Indeks Sprintów](./README.md) po podsumowanie.

---

## Poprzedni sprint

⬅️ [Sprint 07 – Blacklist CRM](./Sprint-07-Blacklist-CRM.md)
