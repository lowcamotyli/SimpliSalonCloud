# Sprint UI-08 - Copy Consistency i Encoding Guardrails

## Cel
Wyeliminowac regresje tekstow, mojibake i niespojnosci jezykowe raz na stale.

## Zakres
- [ ] Audyt copy na glownych ekranach dashboardu
- [ ] Standaryzacja slownictwa (np. Usluga/Uslugi, Dezaktywuj, Przypisz dodatki)
- [ ] Dodanie checka CI na mojibake (`Ä`, `Å`, `Ã`, `â`, `�`)
- [ ] Ujednolicenie kodowania plikow TS/TSX na UTF-8

## Pliki
- `AGENTS.md`
- skrypt/check w `scripts/` (np. `scripts/check-encoding.ps1`)
- pipeline CI (jezeli jest)

## Acceptance Criteria
- [ ] Brak podejrzanych sekwencji znakow w UI source
- [ ] CI failuje przy wykryciu mojibake
- [ ] Copy style guide jest opisany i stosowany

## Weryfikacja
```bash
npx tsc --noEmit
pwsh ./scripts/check-encoding.ps1
```
Manual:
1. Przeglad glownej nawigacji i kluczowych modalow pod katem copy
