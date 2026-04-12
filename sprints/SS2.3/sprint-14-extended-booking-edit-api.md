# Sprint SS2.2-14 — Extended Booking Edit: API Layer

## Cel
(P0) Rozszerzyć możliwości edycji istniejącej wizyty na poziomie API:
- zmiana usługi,
- dodanie kolejnej usługi (multi-service na jednej wizycie),
- dodanie dodatku do istniejącej wizyty,
- zmiana pracownika przy konkretnej pozycji multi-bookingu.

Aktualny PATCH `/api/bookings/[id]` prawdopodobnie obsługuje tylko zmianę statusu i prostych pól — ten sprint rozbudowuje go o full booking mutation.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. TASK: Describe the bookings table structure, group_booking_id concept, booking_addons, and how multi-service bookings are modeled. FORMAT: Bulleted list. LIMIT: Max 25 lines.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Model booking vs group_booking, relacje booking_addons |
| `docs/architecture/multi-tenant-architecture.md` | salon_id isolation przy modyfikacji bookingów |

**Kluczowe constraints:**
- Multi-service booking = wiele wierszy z tym samym `group_booking_id`
- Dodanie usługi do istniejącej wizyty = INSERT nowego wiersza z tym samym `group_booking_id`
- Każda modyfikacja musi respektować konflikty (chyba że force_override — patrz sprint-13)
- Cena całej wizyty (jeśli dotyczy payment history) musi być przeliczona po dodaniu usługi

## Stan aktualny
- `app/api/bookings/[id]/route.ts` — istnieje, zakres do weryfikacji przez codex przed edycją
- `app/api/bookings/group/route.ts` — może obsługiwać tworzenie group bookingów
- Brak potwierdzonego endpointu "dodaj usługę do istniejącej wizyty"

## Otwarte pytania (rozstrzygnij przed dispatchem)
- Czy "dodanie usługi" to:
  a) nowy booking wiersz w tym samym group_booking_id → tak, to właściwy model
  b) czy modyfikacja jednego wiersza → nie, multi-service = multi-row
- Czy zmiana pracownika przy jednej pozycji grupy ma tworzyć nowy booking_id czy zmieniać istniejący?
  → Rekomendacja: zmieniać istniejący booking wiersz w grupie

## Zakres tego sprintu

- [ ] Audyt `app/api/bookings/[id]/route.ts` (PATCH) — co aktualnie obsługuje
- [ ] Rozbudowa PATCH `/api/bookings/[id]`:
  - `service_id` — zmiana usługi na istniejącej wizycie (przelicz czas/cenę)
  - `employee_id` — zmiana pracownika
  - `addon_ids: string[]` — dodaj/zaktualizuj dodatki
  - Walidacja konfliktów (employee + equipment) + obsługa `force_override`
- [ ] Nowy endpoint lub rozbudowa istniejącego: `POST /api/bookings/group/[groupId]/add`
  - Dodaje nową usługę + pracownika do istniejącej grupy
  - Sprawdza konflikty
  - Zwraca nowy booking_id i aktualną sumę ceny grupy
- [ ] Helper/util: `recalculate_group_total(group_booking_id)` — suma cen usług + dodatków

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `app/api/bookings/[id]/route.ts` | EDIT — rozbudowa PATCH | codex-main |
| `app/api/bookings/group/[groupId]/add/route.ts` | CREATE — nowy endpoint | codex-dad |
| `lib/bookings/recalculate-group-total.ts` | CREATE — helper | codex-dad |

## Zależności
- **Wymaga:** sprint-01 (employee-service), sprint-13 (conflict override flag)
- **Blokuje:** sprint-15 (UI edycji wizyty, korzysta z tych endpointów)

---

## Prompt — codex-main (rozbudowa PATCH /api/bookings/[id])

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read app/api/bookings/[id]/route.ts and app/api/bookings/route.ts for context. Do NOT use Gemini — write directly.
Goal: Extend PATCH /api/bookings/[id] to support full booking mutation.
File: app/api/bookings/[id]/route.ts

New PATCH body fields (all optional):
- service_id: string — change the service, recalculate duration and price from services table
- employee_id: string — change the employee (validate employee_services assignment)
- addon_ids: string[] — replace current addons with this list (delete old, insert new)
- force_override: boolean — skip conflict validation if true (internal only)

After any change that affects time/duration, re-check conflicts (employee + equipment).
Update booking price = service.price + sum(addon prices).
Constraints: salon_id must always be verified (cannot edit another salon booking), user must be authenticated.
Done when: tsc clean, PATCH accepts new fields and validates correctly'
```

---

## Prompt — codex-dad (POST add service to group)

```bash
DAD_PROMPT='Read app/api/bookings/route.ts and app/api/bookings/[id]/route.ts for context.
Goal: Create POST /api/bookings/group/[groupId]/add — adds a new service to an existing group booking.
File: /mnt/d/SimpliSalonCLoud/app/api/bookings/group/[groupId]/add/route.ts

Request body: { service_id, employee_id, start_time, addon_ids?: string[], force_override?: boolean }
Steps:
1. Verify group_booking_id belongs to current salon
2. Check employee-service assignment (employee_services table)
3. Check conflicts for employee + equipment (respect force_override)
4. Insert new booking row with same group_booking_id
5. Return { booking_id, group_total_price }
Constraints: salon_id isolation required on all queries. Done when: tsc clean' bash ~/.claude/scripts/dad-exec.sh
```

---

## Weryfikacja po sprincie
```bash
npx tsc --noEmit
# Test manualny (curl lub Postman):
# PATCH /api/bookings/[id] z { service_id: "..." } → zmiana usługi
# POST /api/bookings/group/[groupId]/add → nowa usługa w grupie
```
