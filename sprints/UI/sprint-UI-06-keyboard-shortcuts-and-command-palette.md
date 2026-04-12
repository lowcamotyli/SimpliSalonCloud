# Sprint UI-06 - Keyboard QoL i Command Palette

## Cel
Przyspieszyc prace power-userow i operatorow pracujacych caly dzien w panelu.

## Zakres
- [ ] Skroty globalne (np. `Ctrl/Cmd+K` -> command palette)
- [ ] Skroty modalowe (`Esc`, `Ctrl/Cmd+Enter`, opcjonalnie `Alt+1/2/3` dla zakladek)
- [ ] Szybkie akcje na glowne flow: dodaj klienta/usluge/rezerwacje

## Pliki
- `components/layout/*`
- kluczowe widoki modalowe (`services`, `clients`, `employees`, `booking`)

## Acceptance Criteria
- [ ] Skroty nie koliduja z natywnymi inputami
- [ ] Komendy uruchamiaja te same flow co klik UI
- [ ] Dostepnosc klawiaturowa jest poprawna

## Weryfikacja
```bash
npx tsc --noEmit
```
Manual:
1. Przetestuj skroty na 3 glownych ekranach
2. Sprawdz focus management po otwarciu/zamknieciu modalu
