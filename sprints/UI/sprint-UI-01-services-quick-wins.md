# Sprint UI-01 - Services Quick Wins

## Cel
Szybkie poprawki QoL na ekranie `Uslugi`, bez zmian backendowych.

## Zakres
- [ ] Zapamietywanie widoku `Kafelki/Lista` (localStorage)
- [ ] Lepszy, responsywny pasek akcji zbiorczych (wrap + horizontal overflow fallback)
- [ ] Uspojnienie etykiet i tooltipow akcji (krotkie, jednoznaczne)
- [ ] Drobne poprawki spacingu i czytelnosci przy duzej liczbie uslug

## Pliki
- `app/(dashboard)/[slug]/services/page.tsx`

## Acceptance Criteria
- [ ] Po odswiezeniu strony wybrany widok (`Kafelki/Lista`) pozostaje taki sam
- [ ] Pasek akcji nie "wychodzi" poza viewport na desktop/mobile
- [ ] Wszystkie akcje zbiorcze dzialaja jak przed zmianami

## Weryfikacja
```bash
npx tsc --noEmit
```
Manual:
1. Ustaw `Lista`, odswiez strone -> nadal `Lista`
2. Zaznacz wiele uslug -> pasek akcji mieści sie i jest klikalny
