# Sprint SS2.2-15 — Extended Booking Edit: UI Layer

## Cel
(P0) Dialog edycji wizyty w kalendarzu — dodać pełną ergonomię rozszerzania istniejącej wizyty:
- zmiana usługi lub pracownika,
- dodanie kolejnej usługi (rozszerzenie multi-bookingu),
- dodanie / zmiana dodatków,
- automatyczne przeliczenie ceny i czasu.

Sprint korzysta z API z sprint-14.

## Architektura — dokumenty referencyjne

Nie wymaga odczytu arch docs — czyste UI, brak nowych tabel.

**Kluczowe constraints:**
- Komponent jest `'use client'` — nie dodawać server actions
- shadcn/ui: `Dialog`, `Select`, `Button`, `Badge`, `Separator`
- Cena i czas: obliczaj po stronie klienta z danych serwisu (optymistycznie) + potwierdź odpowiedzią API
- Nie łam istniejącego prostego flow "zapisz wizytę" — zmiany są w osobnej sekcji "Rozszerz wizytę"

## Stan aktualny
- `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` — główny dialog, zakres do audytu
- Prawdopodobnie istnieje edycja prostych pól (status, notatka) — brak dodawania usług

## Zakres tego sprintu

- [ ] Sekcja "Usługi w wizycie" w dialogu edycji istniejącej wizyty:
  - Lista aktualnych usług / pozycji w grupie
  - Przy każdej pozycji: możliwość zmiany usługi lub pracownika (Select)
  - Przycisk "Dodaj usługę" → nowy wiersz z wyborem usługi + pracownika + czasu
  - Przycisk "Usuń" przy dodatkowych usługach (nie można usunąć ostatniej)
- [ ] Sekcja "Dodatki":
  - Multi-select lub lista checkboxów aktualnych i dostępnych dodatków
  - Po zmianie — aktualizacja ceny w czasie rzeczywistym
- [ ] Podsumowanie ceny:
  - `Łączna cena: X zł` aktualizowana przy każdej zmianie
  - `Łączny czas: X min`
- [ ] Submit:
  - "Zapisz zmiany" → PATCH `/api/bookings/[id]` dla zmian istniejących pozycji
  - "Dodaj usługę" → POST `/api/bookings/group/[groupId]/add`
  - Obsługa konfliktów (reuse logiką z sprint-13: checkbox override)

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` | EDIT — nowa sekcja rozszerzania | codex-main |
| `components/calendar/booking-services-editor.tsx` | CREATE — wyodrębniony subkomponent | codex-dad |

## Zależności
- **Wymaga:** sprint-13 (conflict override UI), sprint-14 (API endpointy)
- **Blokuje:** sprint-16 (client balance — UI rozliczenia przy wizycie)

---

## Prompt — codex-dad (subkomponent BookingServicesEditor)

```bash
DAD_PROMPT='Read app/(dashboard)/[slug]/calendar/booking-dialog.tsx for context.
Goal: Create components/calendar/booking-services-editor.tsx — a "use client" React component for editing services in an existing booking.
File: /mnt/d/SimpliSalonCLoud/components/calendar/booking-services-editor.tsx

Props: { bookingId: string, groupId?: string, initialServices: BookingService[], availableServices: Service[], availableEmployees: Employee[], onSaved: () => void }

UI:
- List of current services with Select for service and Select for employee per row
- "Dodaj usługę" button adds a new row (empty selects + time picker)
- "Usuń" button on each row (disabled if only 1 service)
- Multi-select addons for each service row
- Total price and duration display, recalculated on each change
- "Zapisz zmiany" button: PATCH /api/bookings/[id] for existing rows, POST /api/bookings/group/[groupId]/add for new rows
- On 409 conflict: show Alert with override Checkbox (reuse conflict override pattern from booking-dialog)

Use shadcn/ui: Select, Button, Badge, Checkbox, Alert, Separator.
Done when: tsc clean, component renders and submits correctly' bash ~/.claude/scripts/dad-exec.sh
```

---

## Prompt — codex-main (integracja w booking-dialog)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read app/(dashboard)/[slug]/calendar/booking-dialog.tsx for context. Do NOT use Gemini — write directly.
Goal: Integrate BookingServicesEditor component into booking-dialog when in edit mode (existing booking).
Changes:
- In edit mode (bookingId exists), import and render <BookingServicesEditor> below current booking details
- Pass correct props: bookingId, groupId (if group booking), initialServices from booking data, availableServices and availableEmployees from existing dialog fetch
- On onSaved callback: refetch calendar events and close dialog
Constraints: Do not change create mode flow. Do not break existing edit functionality (status change, notes).
Done when: tsc clean'
```

---

## Weryfikacja po sprincie
```bash
npx tsc --noEmit
# Test manualny: otwórz istniejącą wizytę → sekcja "Usługi" widoczna → zmień usługę → zapisz
# Test: dodaj drugą usługę → POST do group/add → obie widoczne w kalendarzu
```
