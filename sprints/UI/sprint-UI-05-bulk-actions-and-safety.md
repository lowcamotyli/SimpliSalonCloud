# Sprint UI-05 - Bulk Actions i Safety UX

## Cel
Przyspieszyc masowe operacje i zmniejszyc ryzyko przypadkowych akcji.

## Zakres
- [ ] Rozszerzenie bulk actions o kontekst (np. ile aktywnych/nieaktywnych w selekcji)
- [ ] Dodatkowe guardy dla destrukcyjnych akcji (clear copy + count + confirm)
- [ ] Opcjonalny szybki "undo" po usunieciu (tam gdzie mozliwe)
- [ ] Uspojnienie bulk action bar miedzy ekranami (Uslugi/Klienci jesli dotyczy)

## Pliki (minimum)
- `app/(dashboard)/[slug]/services/page.tsx`
- `app/(dashboard)/[slug]/clients/page.tsx` (jesli bulk jest lub bedzie)

## Acceptance Criteria
- [ ] Uzytkownik rozumie skutek akcji przed kliknieciem
- [ ] Destrukcyjne flow nie jest przypadkowe
- [ ] Brak utraty danych przez pomylke UX

## Weryfikacja
```bash
npx tsc --noEmit
```
Manual:
1. Bulk delete dla 1 i wielu rekordow -> copy i potwierdzenia sa poprawne
2. Sprawdz zachowanie przy pustej i duzej selekcji
