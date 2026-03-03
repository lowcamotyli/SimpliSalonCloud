# Sprint 06 – SMS Dwukierunkowy, Przypomnienia i Kampanie Last-Minute

> **Typ:** Backend + Frontend + CRON  
> **Wymaga:** Sprint 01 (portmonetka SMS w `sms_wallet`)  
> **Szacowany czas:** 2–3 tygodnie  
> **Trudność:** 5/10 (jednostronne) / 7/10 (dwukierunkowe + Realtime)  
> **Priorytet:** 🟡 Wysoki retencyjny + monetyzacja portmonetki

---

## 📎 Pliki do kontekstu Gemini

> Plik sprintu + Sprint-00 + Sprint-01 (portmonetka SMS) + poniższe pliki.

**Istniejące pliki do MODYFIKACJI:**
- `lib/messaging/sms-sender.ts` – **kluczowy plik** (5 KB); prawdopodobnie ma już podstawową wysyłkę; rozszerz o odejmowanie salda
- `lib/messaging/campaign-processor.ts` – istniejący procesor kampanii (14 KB); sprawdź przed tworzeniem endpointu kampanii
- `app/api/webhooks/smsapi/route.ts` – istniejący webhook SMSAPI; sprawdź co robi, dodaj logikę `inbound`
- `app/api/cron/crm-automations/route.ts` – istniejący CRON automatyzacji CRM; możesz do niego dołożyć logikę przypomnień lub stworzyć osobny plik
- `app/(dashboard)/[slug]/clients/page.tsx` – duży plik (34 KB); dodajesz zakładkę „SMS" z czatem
- `app/api/crm/campaigns/` – istniejące endpointy kampanii; sprawdź przed tworzeniem nowych

**Nie istnieją jeszcze – stworzysz je w tym sprincie:**
- `app/api/sms/send/route.ts` ← wysyłka z CRM z odejmowaniem salda
- `app/api/sms/history/[clientId]/route.ts` ← historia czatu
- `app/api/bookings/confirm/[token]/route.ts` ← potwierdzenie przez klienta
- `app/api/cron/reminders/route.ts` ← CRON przypomnienia
- `app/(dashboard)/[slug]/settings/sms/` – sprawdź czy już istnieje (`app/(dashboard)/[slug]/settings/sms/` jest w strukturze)

**Wzorce do odczytu:**
- `lib/supabase/admin.ts` – używaj admina w CRON (działa poza RLS)
- `lib/messaging/template-renderer.ts` – istniejący renderer szablonów wiadomości

---

## Cel sprintu

Pełna infrastruktura komunikacji SMS: wysyłanie/odbiór wiadomości z poziomu CRM (czat), automatyczne kaskadowe przypomnienia o wizycie z linkiem potwierdzającym, oraz moduł kampanii „Złote Terminy" dla last-minute slotów.

---

## 6.1 Migracja bazy danych

> Plik: `supabase/migrations/20260317_sms_chat.sql`

```sql
-- Historia wiadomości SMS
CREATE TABLE sms_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id            UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  client_id           UUID REFERENCES clients(id)         ON DELETE SET NULL,
  direction           TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  body                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','sent','delivered','failed','received')),
  provider_message_id TEXT,          -- ID wiadomości z SMSAPI/BulkGate
  error_message       TEXT,
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sms_messages_salon_client 
  ON sms_messages(salon_id, client_id, created_at DESC);
CREATE INDEX idx_sms_messages_provider 
  ON sms_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Reguły przypomnień per salon
CREATE TABLE reminder_rules (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id                UUID    NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  hours_before            INT     NOT NULL CHECK (hours_before > 0),
  message_template        TEXT    NOT NULL,
  require_confirmation    BOOLEAN NOT NULL DEFAULT true,   -- wysyłaj link potwierdzenia?
  target_blacklisted_only BOOLEAN NOT NULL DEFAULT false,  -- tylko dla blacklisted?
  is_active               BOOLEAN NOT NULL DEFAULT true
);

-- Seed: domyślne reguły (wstawiać per nowy salon przez trigger lub onboarding)
-- 24h przed – standardowe, 3h przed – dla problematycznych klientów

ALTER TABLE sms_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salon_rw_sms_messages" ON sms_messages FOR ALL USING (
  salon_id = (SELECT salon_id FROM employees WHERE user_id = auth.uid() LIMIT 1)
);
CREATE POLICY "salon_rw_reminder_rules" ON reminder_rules FOR ALL USING (
  salon_id = (SELECT salon_id FROM employees WHERE user_id = auth.uid() LIMIT 1)
);
```

---

## 6.2 Adapter SMS (SMSAPI / BulkGate)

> Plik: `src/lib/sms/adapter.ts`

```typescript
export interface SmsAdapter {
  send(params: {
    to: string;
    body: string;
    from?: string;
  }): Promise<{ messageId: string; status: string }>;
}

// Fabryka w oparciu o zmienną środowiskową
export function getSmsAdapter(): SmsAdapter {
  const provider = process.env.SMS_PROVIDER;
  if (provider === 'smsapi')  return new SmsApiAdapter();
  if (provider === 'bulkgate') return new BulkGateAdapter();
  throw new Error(`Unknown SMS provider: ${provider}`);
}
```

```typescript
// src/lib/sms/smsapi.ts
class SmsApiAdapter implements SmsAdapter {
  async send({ to, body, from }) {
    const res = await fetch('https://api.smsapi.pl/sms.do', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SMSAPI_TOKEN}` },
      body: new URLSearchParams({ to, message: body, from: from ?? process.env.SMS_SENDER_NAME! }),
    });
    const data = await res.json();
    return { messageId: data.list[0].id, status: data.list[0].status };
  }
}
```

---

## 6.3 Usługa wysyłki SMS z odejmowaniem salda

> Plik: `src/lib/sms/send.ts`

```typescript
export async function sendSms(params: {
  to: string;
  body: string;
  salonId: string;
  clientId?: string;
  direction?: 'outbound';
}): Promise<void> {
  const supabase = createAdminClient();
  
  // 1. Sprawdź saldo
  const { data: wallet } = await supabase
    .from('sms_wallet')
    .select('balance')
    .eq('salon_id', params.salonId)
    .single();
    
  if (!wallet || wallet.balance < 1) {
    throw new Error('INSUFFICIENT_SMS_BALANCE');
  }
  
  // 2. Wyślij przez adapter
  const adapter = getSmsAdapter();
  const { messageId } = await adapter.send({ to: params.to, body: params.body });
  
  // 3. Zapisz w historii
  await supabase.from('sms_messages').insert({
    salon_id: params.salonId,
    client_id: params.clientId ?? null,
    direction: 'outbound',
    body: params.body,
    status: 'sent',
    provider_message_id: messageId,
    sent_at: new Date().toISOString(),
  });
  
  // 4. Odejmij saldo (atomic)
  await supabase.rpc('decrement_sms_balance', { p_salon_id: params.salonId });
}
```

```sql
-- Funkcja SQL do atomowego odejmowania salda
CREATE OR REPLACE FUNCTION decrement_sms_balance(p_salon_id UUID)
RETURNS VOID LANGUAGE sql AS $$
  UPDATE sms_wallet 
  SET balance = balance - 1, updated_at = now()
  WHERE salon_id = p_salon_id AND balance > 0;
$$;
```

---

## 6.4 API Routes – SMS

| Endpoint | Metoda | Auth | Opis |
|---|---|---|---|
| `/api/sms/send` | POST | employee | Wyślij SMS z czatu CRM |
| `/api/sms/webhook` | POST | publiczny | Odbiera przychodzące SMS od dostawcy |
| `/api/sms/history/[clientId]` | GET | employee | Historia czatu z klientem |
| `/api/bookings/confirm/[token]` | GET | publiczny | Potwierdzenie/anulowanie przez klienta |
| `/api/cron/reminders` | GET | CRON | Wysyłanie automatycznych przypomnień |
| `/api/sms/campaigns` | POST | owner/manager | Wyślij kampanię do segmentu klientów |
| `/api/settings/sms` | GET/PUT | owner/manager | Konfiguracja dostawcy i reguł |

---

## 6.5 Webhook – odbiór przychodzących SMS

> `POST /api/sms/webhook` – **bez auth, z weryfikacją podpisu dostawcy**

```typescript
export async function POST(req: NextRequest) {
  // 1. Weryfikacja podpisu (SMSAPI/BulkGate wysyła hash w nagłówku)
  const isValid = verifySmsWebhookSignature(req);
  if (!isValid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
  const { from, text, messageId } = await req.json();
  
  // 2. Znajdź klienta po numerze telefonu
  const client = await findClientByPhone(from);
  
  // 3. Zapisz wiadomość
  await supabase.from('sms_messages').insert({
    salon_id: client?.salon_id,
    client_id: client?.id ?? null,
    direction: 'inbound',
    body: text,
    status: 'received',
    provider_message_id: messageId,
  });
  
  // Supabase Realtime automatycznie powiadomi CRM przez broadcast
  return NextResponse.json({ ok: true });
}
```

---

## 6.6 CRON – automatyczne przypomnienia

> `GET /api/cron/reminders` (Vercel Cron: `*/15 * * * *`)

```typescript
export async function GET(req: NextRequest) {
  validateCronRequest(req); // z Sprint-00
  
  const now = new Date();
  
  // Pobierz wszystkie aktywne reguły
  const rules = await supabase.from('reminder_rules')
    .select('*, salons(features)').eq('is_active', true);
  
  for (const rule of rules) {
    if (!hasFeature(rule.salons.features, 'sms_chat')) continue;
    
    const targetTime = new Date(now.getTime() + rule.hours_before * 3600 * 1000);
    const windowStart = new Date(targetTime.getTime() - 7.5 * 60 * 1000); // ±7.5min
    const windowEnd   = new Date(targetTime.getTime() + 7.5 * 60 * 1000);
    
    // Pobierz wizyty w oknie czasowym
    const bookings = await supabase.from('bookings')
      .select('*, clients(*)')
      .eq('salon_id', rule.salon_id)
      .gte('starts_at', windowStart.toISOString())
      .lte('starts_at', windowEnd.toISOString())
      .in('status', ['pending', 'confirmed'])
      .eq('reminder_sent', false); // zapobiega podwójnemu wysłaniu
    
    for (const booking of bookings) {
      // Wygeneruj link potwierdzający
      const token = generateConfirmToken({ bookingId: booking.id, salonId: booking.salon_id });
      const confirmUrl = `${process.env.APP_URL}/api/bookings/confirm/${token}`;
      
      // Podstaw zmienne do szablonu
      const body = rule.message_template
        .replace('{{clientName}}', booking.clients.first_name)
        .replace('{{time}}', format(new Date(booking.starts_at), 'HH:mm'))
        .replace('{{confirmUrl}}', confirmUrl);
      
      await sendSms({ to: booking.clients.phone, body, salonId: rule.salon_id, clientId: booking.clients.id });
      await supabase.from('bookings').update({ reminder_sent: true }).eq('id', booking.id);
    }
  }
  
  return NextResponse.json({ processed: true });
}
```

> Dodaj kolumnę: `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;`

---

## 6.7 Potwierdzenie wizyty przez klienta

> `GET /api/bookings/confirm/[token]?action=confirm|cancel`

```typescript
// 1. Zweryfikuj token JWT (verifyConfirmToken)
// 2. Aktualizuj booking.status:
//    action=confirm → status='confirmed'
//    action=cancel  → status='cancelled'
// 3. Redirect na stronę /{action} z HTML z podziękowaniem
```

---

## 6.8 Frontend – Czat SMS w CRM

W karcie klienta zakładka „SMS" (analogicznie do Sprint 05):

```
[Ogólne] [Rezerwacje] [SMS] [Karty medyczne] [Beauty Plan]
                       ↑ tu
```

**Komponent `<SmsChatView>`:**
- Lista wiadomości (bubbles – przychodzące lewo, wychodzące prawo)
- Pole tekstowe + przycisk „Wyślij"
- Realtime update przez Supabase `supabase.channel('sms:salon_id')` z filtrem clientId
- `useEffect` subscribe: `on('INSERT', payload => setMessages(prev => [...prev, payload.new]))`
- Wyświetl saldo SMS w nagłówku czatu (z linkiem do doładowania)

---

## 6.9 Frontend – Panel Kampanii Last-Minute

W widoku kalendarza przy anulowanej rezerwacji dodać przycisk:

```
[Anulowano wizytę 14:00] [🚀 Wyślij ofertę last-minute]
```

Kliknięcie otwiera modal:
- Podgląd wiadomości (z ceną last-minute do edycji)
- Segmenty docelowe: wszyscy | nieaktywni >90 dni | VIP
- Licznik klientów w segmencie + szacowany koszt SMS
- Przycisk „Wyślij kampanię"

---

## 6.10 Frontend – Panel `/settings/sms`

- Wybór dostawcy (SMSAPI / BulkGate) + klucz API
- Pole „Nadawca SMS" (tekst)
- Lista reguł przypomnień: tabela z kolumnami (godziny przed, szablon, aktywna)
- Przycisk „+ Dodaj regułę" → inline form
- Test wysyłki: wpisz numer → wyślij test

---

## 6.11 Testowanie

### Jednostkowe

```typescript
describe('sendSms', () => {
  it('throws INSUFFICIENT_SMS_BALANCE when balance = 0')
  it('decrements balance by 1 after successful send')
  it('saves to sms_messages with correct direction=outbound')
})

describe('CRON reminders', () => {
  it('sends only to bookings in ±7.5 min window')
  it('sets reminder_sent=true to prevent double-send')
  it('skips salons without sms_chat feature flag')
})
```

### E2E (Playwright)

```typescript
test('Potwierdzenie wizyty przez SMS', async ({ page }) => {
  // 1. Mock SMSAPI – przechwytuj wysłane SMS
  // 2. Stwórz booking na za 24h
  // 3. Wywołaj CRON / api/cron/reminders ręcznie
  // 4. Sprawdź że SMS został "wysłany" (mock)
  // 5. Otwórz link confirm z action=confirm
  // 6. Sprawdź booking.status = 'confirmed'
})

test('Czat SMS działa w czasie rzeczywistym', async ({ page, context }) => {
  // 1. Otwórz CRM klienta w zakładce SMS (page 1)
  // 2. Zasymuluj przychodzącą wiadomość przez mock webhook (page 2 lub API call)
  // 3. Sprawdź że wiadomość pojawia się bez przeładowania (Realtime)
})
```

### Manualny

- [ ] Wyślij SMS testowy z czatu CRM → weryfikacja doręczenia w panelu SMSAPI
- [ ] Sprawdź że saldo SMS spada po wysyłce
- [ ] Odpowiedz na SMS ze zwykłego telefonu → sprawdź że pojawia się w czacie CRM
- [ ] Kampania last-minute: sprawdź że wiadomości trafiają tylko do segmentu

---

## Checklist weryfikacyjna

- [ ] Adapter SMS obsługuje SMSAPI i BulkGate (przełączany przez ENV)
- [ ] Saldo SMS nigdy nie spada poniżej 0 (`decrement_sms_balance` z warunkiem)
- [ ] Webhook weryfikuje podpis dostawcy (nie przyjmuje losowych POST)
- [ ] CRON `reminder_sent=true` zapobiega podwójnemu wysłaniu
- [ ] Czat SMS odświeża się w czasie rzeczywistym (Supabase Realtime)
- [ ] Kampania last-minute wymaga potwierdzenia liczby odbiorców i kosztu
- [ ] `npm run build` bez błędów

---

## Poprzedni / Następny sprint

⬅️ [Sprint 05 – Medical Forms Frontend](./Sprint-05-Medical-Forms-Frontend.md)  
➡️ [Sprint 07 – Czarna Lista CRM i Behawioralny Scoring](./Sprint-07-Blacklist-CRM.md)
