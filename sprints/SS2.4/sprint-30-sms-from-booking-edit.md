# Sprint SS2.4-30 — SMS z widoku edycji wizyty

## Cel
(P1) Z widoku edycji/podglądu wizyty: przycisk "Wyślij SMS" z wyborem szablonu i podglądem treści.
Conflict Override zrealizowany w SS2.3-13 — ten sprint skupia się tylko na SMS.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/integration-architecture.md. List constraints for SMS sending: SMSAPI.pl client location, logging pattern, template variable substitution. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/integration-architecture.md` | SMS pattern (SMSAPI.pl), szablony |
| `docs/architecture/security-model.md` | Kto może wysyłać SMS (rola) |

**Kluczowe constraints:**
- SMS z wizyty: tylko manager/owner — employee nie widzi przycisku
- Szablon może zawierać zmienne (`{{client_name}}`, `{{appointment_time}}` itp.) — uzupełnij danymi z wizyty przed wysłaniem
- Loguj każdy wysłany SMS w `sms_messages` lub `message_logs` (sprawdź który jest używany)
- Sprawdź istniejący sms-client: `grep -r "smsapi\|sms-client\|sendSms" lib/ --include="*.ts" -l`

## Stan aktualny

```bash
# Istniejący klient SMS i szablony
grep -r "sendSms\|smsClient\|SMSAPI" d:/SimpliSalonCLoud/lib --include="*.ts" -l
grep -r "message_templates\|MessageTemplate" d:/SimpliSalonCLoud/app --include="*.ts" --include="*.tsx" -l
# Istniejące endpointy bookings
ls d:/SimpliSalonCLoud/app/api/bookings/
```

## Zakres

### API (codex-dad)
- [ ] `app/api/bookings/[id]/sms/route.ts`
  - POST body: `{ template_id: string }`
  - Pobierz wizytę (booking) → waliduj salon_id (nie IDOR)
  - Pobierz szablon → uzupełnij zmienne danymi z wizyty (imię klienta, data, godzina, usługa)
  - Wywołaj istniejący sms-client → SMSAPI.pl
  - Zapisz do logów (sms_messages / message_logs)
  - Response: `{ success: true, message_id: string }`
  - Auth: tylko manager/owner (sprawdź rolę)

### UI (codex-main)
- [ ] W `booking-dialog.tsx` (lub analogicznym widoku edycji wizyty) — dodaj sekcję "Wyślij SMS"
  - Widoczna tylko dla manager/owner (ukryta dla employee)
  - Select/dropdown: lista szablonów SMS z salonu (GET `/api/message-templates?type=sms`)
  - Po wyborze szablonu: podgląd treści z uzupełnionymi zmiennymi (imię klienta, czas wizyty)
  - Przycisk "Wyślij SMS" → POST `/api/bookings/[id]/sms`
  - Loading state podczas wysyłania
  - Toast po sukcesie: "SMS wysłany do [imię klienta]"
  - Toast po błędzie: "Nie udało się wysłać SMS"

## Work packages

- ID: pkg-api | Type: implementation | Worker: codex-dad | Outputs: `app/api/bookings/[id]/sms/route.ts`
- ID: pkg-ui | Type: implementation | Worker: codex-main | Inputs: pkg-api | Outputs: SMS sekcja w booking dialog

## Verification

```bash
npx tsc --noEmit
# Test: otwórz wizytę jako manager → przycisk "Wyślij SMS" widoczny
# Test: wybierz szablon → podgląd treści z danymi klienta
# Test: wyślij → toast sukcesu + wpis w logach SMS
# Test: zaloguj się jako employee → brak przycisku
# Test: GET /api/bookings/[id_z_innego_salonu]/sms → 403 (IDOR check)
```

## Acceptance criteria

- [ ] Manager/owner widzi przycisk "Wyślij SMS" w dialogu/widoku wizyty
- [ ] Employee NIE widzi przycisku
- [ ] Podgląd szablonu z uzupełnionymi danymi klienta/wizyty przed wysłaniem
- [ ] Wysłany SMS zapisany w logach
- [ ] Endpoint waliduje salon_id (brak IDOR)
- [ ] `npx tsc --noEmit` → clean
