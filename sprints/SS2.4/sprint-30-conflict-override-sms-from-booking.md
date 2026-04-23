# Sprint SS2.4-30 — Wizyty: Conflict Override + SMS z widoku edycji

## Cel
(P1) Dwa ulepszenia w flow zarządzania wizytami:
1. **Conflict Override** — gdy wizyta koliduje z inną, zamiast blokady: pokaż ostrzeżenie z opcją "Zapisz mimo konfliktu" (za zgodą użytkownika).
2. **SMS z edycji wizyty** — w widoku edycji/podglądu wizyty: przycisk "Wyślij SMS" z wyborem szablonu.

*Uwaga: Conflict Override był planowany w SS2.3-13. Sprawdź przed dispatchem czy został zaimplementowany.*

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/security-model.md. List constraints for: (1) conflict override — is it allowed for all roles or only managers/owners? (2) SMS sending from booking — auth requirements. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/security-model.md` | Conflict override: tylko internal panel, kto może |
| `docs/architecture/data-architecture.md` | Bookings conflict detection, bookings log |
| `docs/architecture/integration-architecture.md` | SMS sending pattern (SMSAPI.pl) |

**Kluczowe constraints:**
- Conflict override: **wyłącznie panel wewnętrzny** — public booking NIGDY nie może override konfliktu
- Override musi być zalogowany: kto i kiedy zaakceptował konflikt (pole `force_override_by`, `force_override_at`)
- SMS: tylko manager/owner może wysyłać z widoku wizyty (employee nie)
- SMS z szablonu: szablon może zawierać zmienne (imię klienta, godzina wizyty) — trzeba je uzupełnić przed wysłaniem

## Sprawdzenie stanu SS2.3-13

```bash
# Sprawdź czy conflict override już istnieje
grep -r "force_override\|forceOverride\|conflict.*override" d:/SimpliSalonCLoud/app --include="*.ts" --include="*.tsx" -l
grep -r "force_override" d:/SimpliSalonCLoud/supabase/migrations --include="*.sql"
```

Jeśli już zaimplementowane → pomiń pkg-conflict, skup się tylko na pkg-sms.

## Zakres

### A — Conflict Override API (codex-main, tylko jeśli nie istnieje)
- [ ] `app/api/bookings/route.ts` (POST) — obsługa `force_override: boolean` w body
  - Jeśli `force_override = false` lub brak i wykryto konflikt → 409 z listą konfliktów
  - Jeśli `force_override = true` i user jest auth jako manager/owner → pomiń walidację konfliktu
  - Log: zapisz `force_override_by = user.id`, `force_override_at = now()` na rekordie booking
- [ ] `app/api/bookings/[id]/route.ts` (PATCH) — analogicznie dla edycji

### B — Conflict Override UI (codex-dad, tylko jeśli nie istnieje)
- [ ] `components/calendar/booking-dialog.tsx` — obsługa stanu konfliktowego
  - Aktualnie: błąd 409 → komunikat błędu, dialog się nie zapisuje
  - Nowe: błąd 409 → pokaż sekcję "Wykryto konflikt" z listą kolidujących wizyt
  - Przycisk "Zapisz mimo konfliktu" (danger variant) → retry z `force_override: true`
  - Przycisk "Anuluj" → zamknij dialog

### C — SMS z widoku edycji wizyty (codex-main)
- [ ] W `booking-dialog.tsx` (lub podstronie wizyty) — dodaj sekcję/przycisk "Wyślij SMS"
  - Dostępny tylko dla manager/owner
  - Dropdown/select: lista szablonów SMS dostępnych w salonie
  - Po wyborze szablonu: podgląd treści z uzupełnionymi zmiennymi (imię klienta, czas)
  - Przycisk "Wyślij" → `POST /api/bookings/[id]/sms` lub `POST /api/notifications/send`
  - Potwierdzenie wysłania: toast "SMS wysłany"
- [ ] API: `app/api/bookings/[id]/sms/route.ts`
  - POST body: `{ template_id: string }`
  - Uzupełnij zmienne szablonu danymi z wizyty
  - Wywołaj SMSAPI.pl (przez istniejący sms-client)
  - Zapisz w logach (message_logs lub sms_messages)

## Work packages

- ID: pkg-conflict-api | Type: implementation | Worker: codex-main | Warunkowy: tylko jeśli nie istnieje
- ID: pkg-conflict-ui | Type: implementation | Worker: codex-dad | Warunkowy: tylko jeśli nie istnieje
- ID: pkg-sms-api | Type: implementation | Worker: codex-dad | Outputs: bookings/[id]/sms endpoint
- ID: pkg-sms-ui | Type: implementation | Worker: codex-main | Inputs: pkg-sms-api | Outputs: SMS UI w booking dialog

## Verification

```bash
npx tsc --noEmit
# Test A: utwórz dwie wizyty kolidujące → sprawdź czy pojawia się opcja "Zapisz mimo konfliktu"
# Test A: public booking URL → sprawdź że NIE ma opcji override
# Test B: otwórz wizytę → klik "Wyślij SMS" → wybierz szablon → wyślij → sprawdź logi SMS
# Test B: zaloguj się jako employee → sprawdź że przycisk SMS nie jest widoczny
```

## Acceptance criteria

- [ ] Booking dialog pokazuje konflikt + opcję "Zapisz mimo konfliktu" (zamiast hard blokady)
- [ ] Public booking NIGDY nie oferuje opcji override
- [ ] Override jest logowany w rekordzie booking (kto zaakceptował)
- [ ] Z widoku wizyty manager/owner może wysłać SMS z szablonu
- [ ] Wysłany SMS pojawia się w logach powiadomień
- [ ] `npx tsc --noEmit` → clean
