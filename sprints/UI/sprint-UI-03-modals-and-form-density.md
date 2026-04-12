# Sprint UI-03 - Modale i Gestosc Formularzy

## Cel
Zmniejszenie "pionowych scian formularzy" i poprawa czytelnosci modalowych flow.

## Zakres
- [ ] Standaryzacja: dlugie modale = zakladki (`Profil/Zaawansowane/Media` itp.)
- [ ] Sticky footer akcji (`Anuluj/Zapisz`) tam, gdzie modal jest scrollowany
- [ ] Ujednolicenie szerokosci modalu i spacingu (max-width, max-height, overflow)
- [ ] Przejrzenie krytycznych modalow: `Uslugi`, `Klienci`, `Pracownicy`, `Form Templates`, `Booking Dialog`

## Pliki (minimum)
- `app/(dashboard)/[slug]/services/page.tsx`
- `app/(dashboard)/[slug]/clients/page.tsx`
- `app/(dashboard)/[slug]/employees/page.tsx`
- `app/(dashboard)/[slug]/forms/templates/page.tsx`
- `app/(dashboard)/[slug]/calendar/booking-dialog.tsx`

## Acceptance Criteria
- [ ] Dlugie modale nie wymagaja "szukania" przyciskow akcji
- [ ] Sekcje sa logicznie pogrupowane
- [ ] Brak regresji funkcjonalnej formularzy

## Weryfikacja
```bash
npx tsc --noEmit
```
Manual:
1. Otworz kazdy modal i sprawdz 3 breakpointy (mobile/tablet/desktop)
2. Sprawdz zapis/anuluj bez przewijania do konca
