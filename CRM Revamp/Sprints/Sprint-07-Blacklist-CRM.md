# Sprint 07 – Czarna Lista CRM i Behawioralny Scoring No-Show

> **Typ:** Backend (CRON) + DB + Minimal Frontend  
> **Wymaga:** Sprint 00 (feature flags, CRON guard)  
> **Szacowany czas:** 1 tydzień  
> **Trudność:** 3/10  
> **Priorytet:** 🟡 Ochrona przychodu salonu

---

## 📎 Pliki do kontekstu Gemini

> Plik sprintu + Sprint-00 + poniższe pliki. To krótki sprint – kontekst minimalny.

**Istniejące pliki do MODYFIKACJI:**
- `app/api/bookings/[id]/route.ts` – tu dodajesz rejestrację `client_violations` przy zmianie statusu na `no_show`
- `app/api/cron/crm-automations/route.ts` – istniejący CRON CRM; możesz tu dołączyć scoring lub stworzyć osobny plik
- `app/(dashboard)/[slug]/clients/page.tsx` – duży plik (34 KB); tu dodajesz badge blacklist i sekcję naruszeń
- `app/(dashboard)/[slug]/settings/page.tsx` – główne ustawienia; sprawdź czy nie ma już sekcji CRM

**Nie istnieją jeszcze – stworzysz je w tym sprincie:**
- `app/api/cron/blacklist-scoring/route.ts` ← dzienny CRON scoringu
- `app/api/clients/[id]/blacklist/route.ts` ← manualne dodanie/usunięcie z blacklist
- `app/api/clients/[id]/violations/route.ts` ← historia naruszeń
- `app/api/settings/crm/route.ts` ← konfiguracja progów

**⚠️ Uwaga:** Modyfikacja `app/api/bookings/[id]/route.ts` wymaga odczytania tego pliku w całości przed edycją – prawdopodobnie ma PATCH/DELETE, nie nadpisuj, tylko rozszerz logikę PATCH.

---

## Cel sprintu

Automatyczna ochrona przed klientami generującymi no-show: algorytm scoringu wykrywa wzorce nieodwoływania wizyt i blokuje możliwość samodzielnej rezerwacji online. Minimalny nakład deweloperski przy wysokim efekcie biznesowym.

---

## 7.1 Migracja bazy danych

> Plik: `supabase/migrations/20260324_blacklist.sql`

```sql
-- Rozszerzenie tabeli clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS blacklist_status TEXT NOT NULL DEFAULT 'clean'
    CHECK (blacklist_status IN ('clean', 'warned', 'blacklisted')),
  ADD COLUMN IF NOT EXISTS no_show_count    INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blacklisted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blacklist_reason TEXT;

-- Historia naruszeń klientów
CREATE TABLE client_violations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id)  ON DELETE CASCADE,
  booking_id     UUID REFERENCES bookings(id)           ON DELETE SET NULL,
  violation_type TEXT NOT NULL CHECK (violation_type IN ('no_show','late_cancel')),
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_violations_client ON client_violations(client_id, occurred_at DESC);

-- Konfiguracja progów per salon
CREATE TABLE blacklist_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id            UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE UNIQUE,
  no_show_threshold   INT  NOT NULL DEFAULT 2,    -- liczba no-show → blacklist
  late_cancel_threshold INT NOT NULL DEFAULT 3,   -- liczba późnych anulacji → warned
  window_months       INT  NOT NULL DEFAULT 6,    -- okno czasowe w miesiącach
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salon_rw_violations" ON client_violations FOR ALL USING (
  client_id IN (
    SELECT c.id FROM clients c
    JOIN employees e ON e.salon_id = c.salon_id
    WHERE e.user_id = auth.uid()
  )
);

CREATE POLICY "salon_rw_blacklist_settings" ON blacklist_settings FOR ALL USING (
  salon_id = (SELECT salon_id FROM employees WHERE user_id = auth.uid() LIMIT 1)
);
```

---

## 7.2 CRON – algorytm scoringu

> `GET /api/cron/blacklist-scoring` (Vercel Cron: `0 2 * * *`)

```typescript
export async function GET(req: NextRequest) {
  validateCronRequest(req);
  
  const supabase = createAdminClient();
  
  // Pobierz ustawienia dla wszystkich salonów
  const { data: settings } = await supabase
    .from('blacklist_settings')
    .select('*, salons(features)');
  
  for (const setting of settings) {
    if (!hasFeature(setting.salons.features, 'blacklist')) continue;
    
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - setting.window_months);
    
    // Pobierz klientów z no-show w oknie czasowym
    const { data: violations } = await supabase
      .from('client_violations')
      .select('client_id, violation_type')
      .eq('violation_type', 'no_show')
      .gte('occurred_at', windowStart.toISOString())
      .in('client_id', 
        // tylko klienci tego salonu
        (await supabase.from('clients').select('id').eq('salon_id', setting.salon_id)).data?.map(c => c.id) ?? []
      );
    
    // Grupuj: { clientId → count }
    const counts: Record<string, number> = {};
    for (const v of violations ?? []) {
      counts[v.client_id] = (counts[v.client_id] ?? 0) + 1;
    }
    
    for (const [clientId, count] of Object.entries(counts)) {
      if (count >= setting.no_show_threshold) {
        await supabase.from('clients').update({
          blacklist_status: 'blacklisted',
          no_show_count: count,
          blacklisted_at: new Date().toISOString(),
          blacklist_reason: `Automatyczna blokada: ${count} nieodwołanych wizyt w ciągu ${setting.window_months} mies.`,
        }).eq('id', clientId).eq('blacklist_status', 'clean'); // nie nadpisuj manualnych blokad
      } else if (count === setting.no_show_threshold - 1) {
        await supabase.from('clients').update({
          blacklist_status: 'warned',
          no_show_count: count,
        }).eq('id', clientId).eq('blacklist_status', 'clean');
      }
    }
  }
  
  return NextResponse.json({ ok: true });
}
```

---

## 7.3 Rejestracja no-show w bookingach

> Rozszerzenie endpointu `PATCH /api/bookings/[id]` (zmiana statusu)

```typescript
// Przy zmianie booking.status → 'no_show':
if (newStatus === 'no_show') {
  await supabase.from('client_violations').insert({
    client_id: booking.client_id,
    booking_id: booking.id,
    violation_type: 'no_show',
    occurred_at: new Date().toISOString(),
  });
  
  // Zaktualizuj licznik na kliencie
  await supabase.rpc('increment_client_no_show', { p_client_id: booking.client_id });
}
```

```sql
CREATE OR REPLACE FUNCTION increment_client_no_show(p_client_id UUID)
RETURNS VOID LANGUAGE sql AS $$
  UPDATE clients SET no_show_count = no_show_count + 1 WHERE id = p_client_id;
$$;
```

---

## 7.4 Blokada rezerwacji online

> W publicznym flow rezerwacji online (jeśli istnieje lub będzie):

```typescript
// src/lib/booking/validation.ts
export async function validateClientCanBook(
  phone: string,
  salonId: string
): Promise<{ allowed: boolean; message?: string }> {
  const supabase = createClient();
  const { data: client } = await supabase
    .from('clients')
    .select('blacklist_status')
    .eq('phone', phone)
    .eq('salon_id', salonId)
    .single();
  
  if (client?.blacklist_status === 'blacklisted') {
    return {
      allowed: false,
      message: 'Rezerwacja online jest niedostępna. Prosimy o kontakt telefoniczny z salonem.',
    };
  }
  
  return { allowed: true };
}
```

Blokadę wdrożyć zarówno w:
1. API rezerwacji online (jeśli jest)
2. Formularzu rezerwacji w panelu recepcji (ostrzeżenie, nie blokada pełna – recepcjonista decyduje)

---

## 7.5 Frontend – Widok klienta w CRM

**Badge na karcie klienta:**
```typescript
// Obok imienia klienta
<ClientStatusBadge status={client.blacklist_status} />
// clean     → brak badge
// warned    → ⚠️ "Ostrzeżenie" (żółty)
// blacklisted → 🚫 "Czarna lista" (czerwony)
```

**Sekcja w karcie klienta:**
```
Czarna Lista
├── Status: 🚫 Czarna lista (od 2026-02-15)
├── Powód: Automatyczna blokada: 2 no-show w 6 mies.
├── Historia naruszeń: [tabela: data, typ, rezerwacja]
├── [Usuń z czarnej listy] ← manualne odblokowanie z polem "Powód"]
└── [Dodaj do czarnej listy] ← jeśli status = clean
```

---

## 7.6 Panel `/settings/crm`

```
Ustawienia CRM
├── Próg no-show (liczba): [2] nieodwołanych wizyt →  automatyczna blokada
├── Próg ostrzeżeń: [1] no-show → status "Ostrzeżony"
├── Okno czasowe: [6] miesięcy
├── [Zapisz ustawienia]
└── Lista klientów na czarnej liście (tabela z filtrem)
```

---

## 7.7 API Routes

| Endpoint | Metoda | Auth | Opis |
|---|---|---|---|
| `/api/cron/blacklist-scoring` | GET | CRON | Dzienny scoring |
| `/api/clients/[id]/blacklist` | POST | owner/manager | Manualne dodanie do blacklist |
| `/api/clients/[id]/blacklist` | DELETE | owner/manager | Manualne usunięcie z blacklist |
| `/api/settings/crm` | GET/PUT | owner/manager | Konfiguracja progów |
| `/api/clients/[id]/violations` | GET | employee | Historia naruszeń klienta |

---

## 7.8 Testowanie

### Jednostkowe

```typescript
describe('Blacklist scoring', () => {
  it('marks client as warned after (threshold-1) no-shows')
  it('marks client as blacklisted after threshold no-shows')
  it('does not override manually set blacklist with algorithm')
  it('respects window_months boundary (ignores older violations)')
  it('skips salons without blacklist feature flag')
})

describe('validateClientCanBook', () => {
  it('returns allowed=true for clean client')
  it('returns allowed=false with message for blacklisted client')
  it('returns allowed=true for warned client (only warning shown)')
})
```

### E2E (Playwright)

```typescript
test('Automatyczna blokada po 2 no-show', async ({ page }) => {
  // 1. Stwórz klienta
  // 2. Ustaw próg na 2
  // 3. Oznacz 2 bookings jako no_show dla klienta
  // 4. Wywołaj CRON /api/cron/blacklist-scoring
  // 5. Sprawdź że klient.blacklist_status = 'blacklisted'
  // 6. Sprawdź że badge 🚫 widoczny w CRM
})

test('Blokada rezerwacji online dla klienta na czarnej liście', async ({ page }) => {
  // 1. Ustaw klient.blacklist_status = 'blacklisted'
  // 2. Spróbuj zarezerwować online (API lub UI)
  // 3. Oczekuj error message z informacją o kontakcie telefonicznym
})
```

---

## Checklist weryfikacyjna

- [ ] `client_violations` – rekordy tworzone przy każdym `booking.status = no_show`
- [ ] CRON scoring respektuje `window_months` (nie liczy starych naruszeń)
- [ ] Manualna blokada nie jest nadpisywana przez algorytm (`eq('blacklist_status', 'clean')`)
- [ ] Badge na karcie klienta widoczny dla ról: employee, manager, owner
- [ ] Blokada online zwraca przyjazny komunikat (nie 500)
- [ ] Testy regresji: zmiana statusu bookingu bez no_show nie tworzy violations
- [ ] `npm run build` bez błędów

---

## Poprzedni / Następny sprint

⬅️ [Sprint 06 – SMS Chat & Reminders](./Sprint-06-SMS-Chat-Reminders.md)  
➡️ [Sprint 08 – Ankiety po Wizycie i Raporty Dochodowości](./Sprint-08-Surveys-Reports.md)
