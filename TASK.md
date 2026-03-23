# TASK — Email channel dla ankiet i formularzy przed wizytą

## Branch
`feature/multi-booking`

## Cel
Dodać obsługę email (obok SMS) dla CRONów surveys i pre-appointment-forms.
Motywacja: SMSAPI blokuje linki dla sendera "Test" na staging → email jest jedyną opcją do testów E2E z linkiem.

## Infrastruktura już gotowa
- lib/messaging/email-sender.ts → sendTransactionalEmail() — działa, Resend
- lib/messaging/sms-sender.ts → sendSms() — działa (bez linków na staging)

## Co zrobić (w kolejności)

### 1. Typy (Claude bezpośrednio)
lib/types/settings.ts — dodać channel do:
  surveys: { enabled: boolean, channel?: 'sms' | 'email' | 'both' }
  preAppointmentForms: { enabled: boolean, channel?: 'sms' | 'email' | 'both' }

### 2. UI — selektor kanału (codex-dad)
app/(dashboard)/[slug]/settings/notifications/page.tsx
- Przy sekcji "Ankiety" i "Formularz przed wizytą" dodać radio: SMS / Email / Oba
- Default: sms

### 3. CRON surveys (codex-main)
app/api/cron/surveys/route.ts
- Odczytać notifSettings?.surveys?.channel (default sms)
- email/both: pobrać clients.email, wywołać sendTransactionalEmail z HTML + linkiem
- sms/both: obecna logika SMS

### 4. CRON pre-appointment-forms (codex-dad)
app/api/cron/pre-appointment-forms/route.ts — analogicznie

### 5. HTML templates (Claude, ~10 linii)
Prosty inline HTML: nazwa salonu, imię klienta, przycisk z linkiem.

## Kontekst staging
- Vercel bypass token: rIsqg8tG3f6uqxH6SSjOrTPfAtn0NPuc
- Staging CRON secret: 22bd38fe56ea19359d04f2a0ebf9340379ab4c7c3703d2e5e6c3f22ab27115c5
- Staging Supabase: bxkxvrhspklpkkgmzcge.supabase.co (service role w .env.local)
- Salon ID: f5d0f479-5959-4cf8-8a3f-24f63a981f9b
- Klient testowy: 8ba57a15-7070-4958-9104-ef18bbaa78ae (Bartosz Rogala, +48 575 011 093)

## Lekcje z sesji testowej
- toDateTime w surveys CRON miał bug timezone (UTC vs Warsaw) → JUZ NAPRAWIONE
- Orphaned satisfaction_surveys rows blokują retry → czyść przez REST API przed re-testem
- CRON surveys ma debug logging (debug[] w response) — zostaw
- curl na Windows wymaga -k (schannel SSL)
