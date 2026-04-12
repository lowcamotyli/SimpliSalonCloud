# Sprint UI-07 - Mobile Ergonomia i Touch Targets

## Cel
Poprawa ergonomii na mobile: mniej "misclickow", szybsza nawigacja, lepsze sticky akcje.

## Zakres
- [ ] Minimum 40x40 dla klikalnych ikon i akcji krytycznych
- [ ] Sprawdzenie sticky action bars na mniejszych viewportach
- [ ] Usprawnienie overflow i poziomego scrolla dla chipow/tabow
- [ ] Audyt formularzy na mobile (klawiatura zaslaniajaca CTA, spacing)

## Pliki
- `app/(dashboard)/[slug]/services/page.tsx`
- `app/(dashboard)/[slug]/clients/page.tsx`
- `app/(dashboard)/[slug]/calendar/*`
- `components/layout/sidebar.tsx` / mobile nav

## Acceptance Criteria
- [ ] Brak elementow krytycznych poza viewportem
- [ ] Akcje glowne sa latwo klikalne kciukiem
- [ ] Widoki nie "skacza" przy otwieraniu klawiatury ekranowej

## Weryfikacja
```bash
npx tsc --noEmit
```
Manual:
1. Test na 360x800, 390x844, 430x932
2. Przejscie przez kluczowe flow: dodaj usluge, edytuj klienta, nowa wizyta
