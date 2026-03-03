# Sprint 04 – Medyczne Karty Zabiegowe – Schemat DB i Form Builder Engine

> **Typ:** DB Migration + Core Backend Engine  
> **Wymaga:** Sprint 00 ukończony  
> **Szacowany czas:** 1 tydzień  
> **Trudność:** 6/10  
> **Priorytet:** 🟠 Najwyższy sprzedażowy – eliminuje BeautyCheck (150–349 PLN/mc)

---

## 📎 Pliki do kontekstu Gemini

> Ten sprint to głównie **migracje SQL + biblioteki TypeScript**. Nie buduj jeszcze UI.

**Istniejące pliki do ODCZYTU:**
- `DATABASE_FUNDAMENTALS_SUMMARY.md` – zrozum schemat `clients`, `bookings`, `services`, `salons`
- `lib/messaging/crypto.ts` – sprawdź czy jest już jakiś moduł kryptograficzny (może nie trzeba pisać od zera)
- `supabase/migrations/` – ostatnie 2–3 pliki, żeby wiedzieć jakie pola ma `clients`
- `app/api/clients/route.ts` – zrozum pola tabeli klientów

**Nie istnieją jeszcze – stworzysz je w tym sprincie:**
- `supabase/migrations/YYYYMMDD_medical_forms.sql` ← cała migracja (form_templates, service_forms, client_forms, beauty_plans)
- `lib/forms/encryption.ts` ← szyfrowanie AES-256-GCM
- `lib/forms/token.ts` ← JWT do linków publicznych

**⚠️ Uwaga na lib/messaging/crypto.ts:** jeśli ten plik już obsługuje szyfrowanie, dostosuj go zamiast tworzyć nowy `lib/forms/encryption.ts`.

---

## Cel sprintu

Zaprojektowanie i wdrożenie schematu bazy danych dla dynamicznych formularzy medycznych, podpisów i beauty planów. Stworzenie silnika Form Builder po stronie backendu (struktura JSONB, tokenizacja linków, walidacja RODO). Bez tego sprintu nie można budować UI (Sprint 05).

---

## 4.1 Migracja bazy danych

> Plik: `supabase/migrations/20260310_medical_forms.sql`

```sql
-- ============================================================
-- Szablony formularzy (kreator właściciela salonu)
-- ============================================================
CREATE TABLE form_templates (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id             UUID    NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name                 TEXT    NOT NULL,
  description          TEXT,
  fields               JSONB   NOT NULL DEFAULT '[]',
  requires_signature   BOOLEAN NOT NULL DEFAULT false,
  gdpr_consent_text    TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_templates_salon ON form_templates(salon_id);

-- ============================================================
-- Przypisanie szablonu do usług (wiele-do-wielu)
-- ============================================================
CREATE TABLE service_forms (
  service_id       UUID NOT NULL REFERENCES services(id)       ON DELETE CASCADE,
  form_template_id UUID NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, form_template_id)
);

-- ============================================================
-- Wypełnione formularze klientów
-- RODO: kolumna `answers` musi być szyfrowana (patrz 4.3)
-- ============================================================
CREATE TABLE client_forms (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID    NOT NULL REFERENCES clients(id)        ON DELETE CASCADE,
  booking_id       UUID    REFERENCES  bookings(id)               ON DELETE SET NULL,
  form_template_id UUID    NOT NULL REFERENCES form_templates(id) ON DELETE RESTRICT,
  answers          BYTEA   NOT NULL,         -- zaszyfrowany JSONB (AES-256-GCM)
  answers_iv       BYTEA   NOT NULL,         -- wektor inicjalizacyjny (IV) do deszyfrowania
  signature_url    TEXT,                     -- URL podpisu w Supabase Storage
  signed_at        TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ,
  fill_token       TEXT    UNIQUE,           -- jednorazowy JWT do publicznego linku
  fill_token_exp   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_forms_client   ON client_forms(client_id);
CREATE INDEX idx_client_forms_booking  ON client_forms(booking_id);
CREATE INDEX idx_client_forms_token    ON client_forms(fill_token) WHERE fill_token IS NOT NULL;

-- ============================================================
-- Beauty Plany
-- ============================================================
CREATE TABLE beauty_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id)   ON DELETE CASCADE,
  created_by  UUID REFERENCES employees(id)          ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','completed','abandoned')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE beauty_plan_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES beauty_plans(id) ON DELETE CASCADE,
  service_id   UUID REFERENCES services(id)  ON DELETE SET NULL,
  booking_id   UUID REFERENCES bookings(id)  ON DELETE SET NULL,
  planned_date DATE,
  notes        TEXT,
  step_order   INT  NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_beauty_plans_client ON beauty_plans(client_id);
CREATE INDEX idx_beauty_plan_steps_plan ON beauty_plan_steps(plan_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE form_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_forms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_forms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty_plan_steps  ENABLE ROW LEVEL SECURITY;

-- form_templates: salon może czytać i pisać swoje szablony
CREATE POLICY "salon_rw_form_templates" ON form_templates FOR ALL USING (
  salon_id = (SELECT salon_id FROM employees WHERE user_id = auth.uid() LIMIT 1)
);

-- client_forms: pracownicy salonu mogą czytać (odszyfrowanie w aplikacji)
CREATE POLICY "salon_read_client_forms" ON client_forms FOR SELECT USING (
  client_id IN (
    SELECT c.id FROM clients c
    JOIN employees e ON e.salon_id = c.salon_id
    WHERE e.user_id = auth.uid()
  )
);

-- beauty_plans / steps: salon może wszystko
CREATE POLICY "salon_rw_beauty_plans" ON beauty_plans FOR ALL USING (
  client_id IN (
    SELECT c.id FROM clients c
    JOIN employees e ON e.salon_id = c.salon_id
    WHERE e.user_id = auth.uid()
  )
);
```

---

## 4.2 Schemat JSONB – definicja pól formularza

Kolumna `form_templates.fields` przechowuje tablicę definicji pól:

```typescript
// src/types/forms.ts
export type FieldType =
  | 'text'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'date'
  | 'signature'
  | 'photo_upload'
  | 'section_header';    // separatory wizualne

export interface FormField {
  id: string;            // unikalny w obrębie szablonu (np. "q1", "q2")
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];    // dla checkbox, radio, select
  helpText?: string;     // tekst pomocniczy pod polem
  conditionalShowIf?: {  // pokaż jeśli inne pole ma daną wartość
    fieldId: string;
    value: string;
  };
}

export interface FormTemplate {
  id: string;
  salon_id: string;
  name: string;
  description?: string;
  fields: FormField[];
  requires_signature: boolean;
  gdpr_consent_text?: string;
  is_active: boolean;
}
```

---

## 4.3 Szyfrowanie danych medycznych (RODO)

Moduł szyfrowania po stronie Next.js przed zapisem do DB:

> Plik: `src/lib/forms/encryption.ts`

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.FORMS_ENCRYPTION_KEY!, 'hex'); // 32 bajty hex

export function encryptAnswers(plaintext: object): { encrypted: Buffer; iv: Buffer } {
  const iv = randomBytes(12);                    // 96-bit IV dla GCM
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const json = JSON.stringify(plaintext);
  const encrypted = Buffer.concat([
    cipher.update(json, 'utf8'),
    cipher.final(),
  ]);
  return { encrypted, iv };
}

export function decryptAnswers(encrypted: Buffer, iv: Buffer): object {
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}
```

Dodać do `.env.local`:
```bash
# 32 losowe bajty zakodowane hex (64 znaki)
FORMS_ENCRYPTION_KEY=<openssl rand -hex 32>
```

---

## 4.4 Generowanie tokenizowanych linków do formularzy

> Plik: `src/lib/forms/token.ts`

```typescript
import jwt from 'jsonwebtoken';

interface FormTokenPayload {
  formTemplateId: string;
  clientId: string;
  bookingId?: string;
  salonId: string;
}

export function generateFormToken(payload: FormTokenPayload, expiresIn = '72h'): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn });
}

export function verifyFormToken(token: string): FormTokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as FormTokenPayload;
}
```

Link wysyłany klientowi przez SMS:
```
https://app.simplisalon.pl/forms/fill/{token}
```

---

## 4.5 Testy schematu i bezpieczeństwa

```typescript
// src/lib/forms/__tests__/encryption.test.ts
describe('Form Encryption', () => {
  it('encrypts and decrypts answers correctly')
  it('different IVs produce different ciphertexts for same plaintext')
  it('throws on tampered ciphertext')
  it('encrypted buffer stored as BYTEA is not human-readable JSON')
})

// src/lib/forms/__tests__/token.test.ts
describe('Form Token', () => {
  it('generates valid JWT with correct payload')
  it('throws on expired token')
  it('throws on tampered signature')
  it('includes expiresIn 72h correctly')
})
```

```sql
-- Weryfikacja RODO w bazie: answers nie może być tekstem JSON
-- (BYTEA gwarantuje brak czytelności bez klucza)
SELECT pg_typeof(answers) FROM client_forms LIMIT 1;
-- OCZEKIWANE: bytea
```

---

## Checklist weryfikacyjna

- [ ] Wszystkie tabele z migracji istnieją w Supabase
- [ ] RLS włączone na `client_forms` – pracownicy zewnętrzni nie widzą danych
- [ ] `client_forms.answers` jest typem `BYTEA` (nie `TEXT` ani `JSONB`)
- [ ] `FORMS_ENCRYPTION_KEY` dodany do `.env.local` i Vercel (64 znaki hex)
- [ ] Szyfrowanie/deszyfrowanie przechodzi testy jednostkowe
- [ ] Token JWT wygasa po 72h i rzuca błąd po wygaśnięciu
- [ ] `npm run build` bez błędów TypeScript

---

## Poprzedni / Następny sprint

⬅️ [Sprint 03 – Equipment Backend/Frontend](./Sprint-03-Equipment-Backend-Frontend.md)  
➡️ [Sprint 05 – Medyczne Karty – Backend, Frontend i Beauty Plany](./Sprint-05-Medical-Forms-Frontend.md)
