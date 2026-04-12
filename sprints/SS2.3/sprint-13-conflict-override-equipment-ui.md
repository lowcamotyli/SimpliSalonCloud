# Sprint SS2.2-13 — Booking: Conflict Override + Equipment Visibility

## Cel
(P0) Dwa małe brakujące elementy UX kalendarza — oba dotykają tych samych komponentów:
1. Możliwość zapisu wizyty mimo wykrytego konfliktu (z jawnym potwierdzeniem w UI).
2. Widoczność przypisanego sprzętu/stanowiska w dialogu i na kaflu wizyty.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/security-model.md. TASK: List constraints for internal-panel-only features vs public booking endpoints. FORMAT: Bulleted list. LIMIT: Max 15 lines.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/security-model.md` | Conflict override tylko wewnętrznie — weryfikacja admin-only pattern |
| `docs/architecture/data-architecture.md` | Struktura tabeli bookings/equipment reservations |

**Kluczowe constraints:**
- Conflict override: **wyłącznie panel wewnętrzny** — public booking (`/api/public/bookings`) NIGDY nie może używać override
- Override musi być jawną flagą w API i być logowany (kto i kiedy zaakceptował konflikt)
- Sprzęt: dane muszą być joinowane w istniejącym zapytaniu, nie osobny fetch

## Stan aktualny
- Konflikty są wykrywane w `app/api/bookings/route.ts` i zwracają błąd 409
- `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` pokazuje błąd konfliktu — brak opcji override
- Sprzęt jest rezerwowany (`equipment_reservations`), ale nie widać go w dialogu edycji ani na kaflu

## Otwarte pytania (rozstrzygnij przed dispatchem)
- Czy override konfliktu pracownika i sprzętu mają osobne ścieżki, czy jeden wspólny flag?
  → Rekomendacja: jeden flag `force_override: true` + log który typ konfliktu był
- Czy sprzęt ma być widoczny na kaflu w kalendarzu, czy tylko w dialogu edycji?
  → Rekomendacja: dialog edycji + hover card — kafel zbyt mały

## Zakres tego sprintu

### A — Conflict Override
- [ ] API: `app/api/bookings/route.ts` — dodaj obsługę `force_override: boolean` w POST body
  - jeśli `force_override = true` i użytkownik jest auth — pomiń walidację konfliktu
  - zaloguj override do tabeli `booking_audit_log` (lub istniejącego audyt-loga) z `user_id` + `conflict_type`
  - public endpoint `/api/public/bookings` NIGDY nie może akceptować `force_override`
- [ ] UI: `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` (lub `components/calendar/booking-dialog.tsx`)
  - po otrzymaniu 409 z info o konflikcie — pokaż szczegółowy komunikat
  - dodaj checkbox "Akceptuję kolizję i chcę zapisać wizytę mimo to"
  - po zaznaczeniu: przycisk "Zapisz mimo konfliktu" re-submituje z `force_override: true`

### B — Equipment Visibility
- [ ] API / query: upewnij się, że `GET /api/bookings/[id]` zwraca `equipment_name` lub JOIN do `equipment_reservations + equipment`
- [ ] UI: `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` — dodaj sekcję "Sprzęt / Stanowisko" (read-only, informacyjnie)
- [ ] Opcjonalnie: hover card na kaflu wizyty (jeśli już istnieje `BookingCard` hover) — dodaj linie sprzętu

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `app/api/bookings/route.ts` | EDIT — force_override flag | codex-dad |
| `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` | EDIT — conflict UI + equipment display | codex-main |
| `components/calendar/booking-card.tsx` | EDIT — opcjonalnie equipment tooltip | codex-dad |

## Zależności
- **Wymaga:** sprint-01/02 (employee-service) — dla spójności konfliktów
- **Blokuje:** sprint-14 (edycja wizyty) — booking-dialog dalej rozbudowywany

---

## Prompt — codex-dad (API: force_override)

```bash
DAD_PROMPT='Read app/api/bookings/route.ts. Goal: Add force_override support to POST /api/bookings.
File: /mnt/d/SimpliSalonCLoud/app/api/bookings/route.ts
Changes:
1. Accept optional force_override: boolean in request body
2. If force_override=true AND user is authenticated internal user (not public endpoint) — skip conflict validation and proceed with insert
3. After successful insert with override, insert one row into booking_audit_log table: { booking_id, user_id, action: "conflict_override", details: { conflict_types: [...] } } — use upsert/ignore if table does not exist yet
Constraints: public /api/public/bookings must NEVER accept force_override — only app/api/bookings (authenticated internal)
Done when: tsc clean, force_override=true allows saving conflicting booking' bash ~/.claude/scripts/dad-exec.sh
```

---

## Prompt — codex-main (UI: conflict dialog + equipment)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read app/(dashboard)/[slug]/calendar/booking-dialog.tsx for context. Do NOT use Gemini — write directly.
Goal: (1) Show conflict override checkbox when 409 conflict error occurs. (2) Display assigned equipment in booking dialog.

Part 1 — Conflict Override:
- After receiving 409 conflict response, show the conflict message and a Checkbox labeled "Akceptuję kolizję — zapisz wizytę mimo to"
- When checkbox is checked, enable button "Zapisz mimo konfliktu" that re-submits the form with forceOverride: true in the request body
- Use shadcn/ui Checkbox and Alert components

Part 2 — Equipment Display:
- In the booking details section of the dialog, add a read-only field "Sprzęt / Stanowisko" showing equipment name if present in booking data
- Fetch equipment from booking data (assume API returns equipment_name field)
- If no equipment assigned, do not show the field

Done when: tsc clean, UI renders correctly'
```

---

## Weryfikacja po sprincie
```bash
npx tsc --noEmit
# Sprawdź ręcznie: utwórz konfliktującą wizytę → 409 → checkbox → override → zapisano
# Sprawdź ręcznie: otwórz dialog wizyty ze sprzętem → widoczna nazwa sprzętu
```
