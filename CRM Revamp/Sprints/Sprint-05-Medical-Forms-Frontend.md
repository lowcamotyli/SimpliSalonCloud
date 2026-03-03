# Sprint 05 – Medyczne Karty – Backend, Frontend i Beauty Plany

> **Typ:** Backend (API) + Frontend (UI)  
> **Wymaga:** Sprint 04 ukończony (tabele, szyfrowanie, token system)  
> **Szacowany czas:** 2–3 tygodnie  
> **Trudność:** 6/10  
> **Priorytet:** 🟠 Najwyższy sprzedażowy

---

## 📎 Pliki do kontekstu Gemini

> Plik sprintu + Sprint-00 + Sprint-04 (schemat DB) + poniższe pliki.

**Istniejące pliki do MODYFIKACJI:**
- `app/api/bookings/route.ts` – dodajesz logikę wysyłki linku do formularza po zapisaniu bookingu (sekcja POST)
- `app/(dashboard)/[slug]/clients/page.tsx` – duży plik (34 KB); tu dodajesz zakładki „Karty medyczne" i „Beauty Plan"
- `app/api/services/[id]/route.ts` – tu dodajesz endpoint przypisania formularzy do usługi
- `lib/messaging/sms-sender.ts` – istniejący moduł wysyłki SMS; użyj go do wysyłania linku z formularzem

**Nie istnieją jeszcze – stworzysz je w tym sprincie:**
- `app/api/forms/templates/route.ts` ← CRUD szablonów
- `app/api/forms/templates/[id]/route.ts` ← edycja/usunięcie
- `app/api/forms/public/[token]/route.ts` ← publiczny endpoint (bez auth)
- `app/api/forms/submit/[token]/route.ts` ← zapis odpowiedzi
- `app/api/clients/[id]/forms/route.ts` ← historia formularzy klienta
- `app/api/clients/[id]/beauty-plans/route.ts` ← beauty plany
- `app/forms/fill/[token]/page.tsx` ← publiczna strona formularza (poza layoutem dashboard)
- `app/(dashboard)/[slug]/settings/forms/page.tsx` ← kreator szablonów

**Wzorce:**
- `lib/forms/encryption.ts` i `lib/forms/token.ts` – stworzone w Sprint-04
- `lib/supabase/admin.ts` – do operacji na `client_forms` po stronie serwera (BYTEA wymaga admina)

---

## Cel sprintu

Zbudowanie pełnego przepływu: właściciel tworzy szablon → przypisuje do usługi → klient otrzymuje SMS z linkiem → wypełnia formularz na telefonie → podpisuje → pracownik widzi w CRM. Dodatkowo wdrożenie Beauty Planów w karcie klienta.

---

## 5.1 API Routes – Szablony formularzy (salon)

| Endpoint | Metoda | Auth | Opis |
|---|---|---|---|
| `/api/forms/templates` | GET | employee | Lista szablonów salonu |
| `/api/forms/templates` | POST | owner/manager | Utwórz szablon |
| `/api/forms/templates/[id]` | GET | employee | Szczegóły szablonu |
| `/api/forms/templates/[id]` | PUT | owner/manager | Edytuj szablon |
| `/api/forms/templates/[id]` | DELETE | owner/manager | Soft-delete (`is_active = false`) |
| `/api/services/[id]/forms` | GET | employee | Formularze przypisane do usługi |
| `/api/services/[id]/forms` | PUT | owner/manager | Przypisz formularze do usługi |

**POST `/api/forms/templates`** – walidacja wejścia:

```typescript
import { z } from 'zod';

const FormFieldSchema = z.object({
  id:       z.string().min(1),
  type:     z.enum(['text','textarea','checkbox','radio','select','date','signature','photo_upload','section_header']),
  label:    z.string().min(1).max(500),
  required: z.boolean(),
  options:  z.array(z.string()).optional(),
  helpText: z.string().optional(),
});

const CreateTemplateSchema = z.object({
  name:                z.string().min(2).max(200),
  description:         z.string().optional(),
  fields:              z.array(FormFieldSchema).min(1).max(50),
  requires_signature:  z.boolean().default(false),
  gdpr_consent_text:   z.string().optional(),
});
```

---

## 5.2 API Routes – Publiczny flow fill formularza

### GET `/api/forms/public/[token]`

**Publiczny endpoint (bez auth).**

```typescript
// 1. Zweryfikuj token JWT (verifyFormToken)
// 2. Pobierz form_template (fields, name, gdpr_consent_text)
// 3. Sprawdź czy client_forms.fill_token nie wygasł
// 4. Zwróć { template, clientName, salonName }
// Nie zwracaj żadnych danych medycznych klienta
```

### POST `/api/forms/submit/[token]`

**Publiczny endpoint (bez auth).**

```typescript
// 1. Zweryfikuj token JWT
// 2. Walidacja odpowiedzi wg fields[].required
// 3. Szyfruj answers: const { encrypted, iv } = encryptAnswers(answers)
// 4. Zapisz signature do Supabase Storage (jeśli podpis)
//    Storage path: `signatures/{salonId}/{clientId}/{timestamp}.png`
// 5. UPDATE client_forms SET answers=encrypted, answers_iv=iv, 
//       signature_url=url, signed_at=now(), submitted_at=now()
//    WHERE fill_token = token
// 6. Unieważnij token: fill_token = NULL (jednorazowe użycie)
```

---

## 5.3 API Routes – Historia formularzy klienta (CRM)

### GET `/api/clients/[id]/forms`

```typescript
// Auth: employee
// Zwróć listę client_forms dla klienta (bez odszyfrowania):
// { id, form_template_name, submitted_at, signed_at, signature_url }
```

### GET `/api/clients/[id]/forms/[formId]`

```typescript
// Auth: employee
// Pobierz client_forms WHERE id = formId AND client_id = id
// Odszyfruj: answers = decryptAnswers(row.answers, row.answers_iv)
// Zwróć { answers, template.fields } – do renderowania widoku
```

---

## 5.4 Automatyczne wysyłanie linku do formularza

Rozszerzenie endpointu tworzenia bookingu (`POST /api/bookings`):

```typescript
// Po zapisaniu bookingu, jeśli usługa ma przypisane formularze:
const templates = await getFormsForService(serviceId);
for (const template of templates) {
  const token = generateFormToken({
    formTemplateId: template.id,
    clientId: booking.client_id,
    bookingId: booking.id,
    salonId: booking.salon_id,
  });
  
  // Zapisz token w client_forms
  await supabase.from('client_forms').insert({
    client_id: booking.client_id,
    booking_id: booking.id,
    form_template_id: template.id,
    answers: Buffer.alloc(0),   // placeholder do uzupełnienia
    answers_iv: Buffer.alloc(0),
    fill_token: token,
    fill_token_exp: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
  });
  
  // Wyślij SMS z linkiem (jeśli salon ma SMS włączone)
  if (hasFeature(salon.features, 'sms_chat')) {
    await sendSms({
      to: client.phone,
      body: `Przed wizytą prosimy o wypełnienie formularza: ${process.env.APP_URL}/forms/fill/${token}`,
      salonId: salon.id,
    });
  }
}
```

---

## 5.5 API Routes – Beauty Plany

| Endpoint | Metoda | Auth | Opis |
|---|---|---|---|
| `/api/clients/[id]/beauty-plans` | GET | employee | Lista planów klienta |
| `/api/clients/[id]/beauty-plans` | POST | employee | Utwórz plan |
| `/api/beauty-plans/[id]` | GET | employee | Szczegóły planu z krokami |
| `/api/beauty-plans/[id]` | PUT | employee | Edytuj plan |
| `/api/beauty-plans/[id]/steps` | POST | employee | Dodaj krok do planu |
| `/api/beauty-plans/[id]/steps/[stepId]` | PATCH | employee | Oznacz krok jako ukończony |

---

## 5.6 Frontend – Panel `/settings/forms`

**Układ strony:**
```
/settings/forms
├── Lista szablonów (karta: nazwa, liczba pól, przypisane usługi)
├── Przycisk "Nowy formularz" → strona kreatora
└── Karta: [Edytuj] [Kopiuj] [Dezaktywuj]
```

**Kreator formularzy (`/settings/forms/new` i `/settings/forms/[id]/edit`):**
- Drag-and-drop pól (biblioteka `dnd-kit` lub `react-beautiful-dnd`)
- Sidebar z typami pól do przeciągnięcia
- Podgląd na żywo (prawy panel)
- Pole konfiguracyjne per pole: label, required, opcje
- Pole zgody RODO (textarea) na dole

---

## 5.7 Frontend – Publiczna strona formularza

> Ścieżka: `src/app/forms/fill/[token]/page.tsx`  
> **Strona publiczna** (bez layoutu dashboardu)

```typescript
// Pobierz szablony przez GET /api/forms/public/[token]
// Renderuj pola dynamicznie wg field.type
// Podpis cyfrowy: biblioteka `signature_pad` (npm install signature_pad)
// Na Submit → POST /api/forms/submit/[token]
// Po sukcesie: strona z podziękowaniem "Formularz wypełniony! Do zobaczenia."
```

Wymagania UI:
- Responsywne (telefon/tablet)
- Duże pola formularza (A11Y)
- Pasek postępu (krok N/M)
- Logo salonu (pobrane ze settings)

---

## 5.8 Frontend – CRM: Karta klienta – zakładka „Karty medyczne"

W istniejącym widoku klienta (`/clients/[id]`) dodać zakładkę:

```
[Ogólne] [Rezerwacje] [SMS] [Karty medyczne] [Beauty Plan]
                                   ↑ tu
```

**Lista formularzy:**
- Tabela: Data przesłania, Nazwa szablonu, Status (wypełniony/oczekuje), Podpis (✓/✗)
- Kliknięcie wiersza → modal z odczytanymi (odszyfrowanymi) odpowiedziami
- Przycisk „Wygeneruj PDF" (używa `@react-pdf/renderer`)
- Przycisk „Wyślij link ponownie" (regeneruje token)

---

## 5.9 Frontend – CRM: Karta klienta – zakładka „Beauty Plan"

```
Timeline pionowa:
├── ● Zabieg 1: Peeling kwasowy (15.02.2026) ✓
├── ● Zabieg 2: Mezoterapia (01.03.2026) ✓  
├── ○ Zabieg 3: RF lifting (planowany: 15.04.2026)
└── [+ Dodaj krok]
```

Kliknięcie kroku → link do powiązanej rezerwacji lub formularz dodania.

---

## 5.10 Testowanie

### Jednostkowe

```typescript
// Walidacja szablonów
describe('FormTemplate validation', () => {
  it('rejects template with 0 fields')
  it('rejects field with empty label')
  it('accepts conditional fields with valid fieldId reference')
})

// Szyfrowanie odpowiedzi
describe('Answer submission', () => {
  it('encrypts before saving to DB')
  it('decrypts correctly in GET /api/clients/[id]/forms/[formId]')
  it('invalidates token after first submission')
})
```

### E2E (Playwright)

```typescript
test('Pełny flow formularza medycznego', async ({ page, context }) => {
  // 1. Zaloguj jako owner
  // 2. Utwórz szablon formularza z 3 polami (text, checkbox, signature)
  // 3. Przypisz szablon do usługi
  // 4. Stwórz booking dla usługi
  // 5. Sprawdź że SMS z linkiem został wysłany (mock SMSAPI)
  // 6. Otwórz link /forms/fill/{token} w nowej karcie (bez cookies = public)
  // 7. Wypełnij formularz, dodaj podpis
  // 8. Submit
  // 9. Wróć do CRM → klient → Karty medyczne
  // 10. Sprawdź że formularz widoczny ze statusem "wypełniony"
  // 11. Kliknij wiersz → sprawdź że odpowiedzi są czytelne (po deszyfrowaniu)
});
```

### Testy regresji

- [ ] Tworzenie bookingu bez przypisanego formularza nadal działa (brak SMS)
- [ ] Istniejące zakładki klienta (Ogólne, Rezerwacje) nadal działają
- [ ] `npm run build` bez błędów

---

## Checklist weryfikacyjna

- [ ] GET/POST `/api/forms/templates` – CRUD działa z walidacją Zod
- [ ] Publiczny endpoint nie zwraca danych medycznych innych klientów
- [ ] Token jednorazowy (fill_token) unieważniany po submit
- [ ] `client_forms.answers` przechowywane jako BYTEA (nie JSON)
- [ ] Kreator formularzy drag-and-drop działa na desktop i mobile
- [ ] Publiczny formularz responsywny na telefonie
- [ ] PDF generowany poprawnie z podpisem
- [ ] Testy E2E full flow zdane
- [ ] `npm run build` bez błędów

---

## Poprzedni / Następny sprint

⬅️ [Sprint 04 – Medical Forms DB](./Sprint-04-Medical-Forms-DB.md)  
➡️ [Sprint 06 – SMS Dwukierunkowy i Przypomnienia](./Sprint-06-SMS-Chat-Reminders.md)
