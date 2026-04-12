# Sprint UI-02 - Sticky Context i Nawigacja

## Cel
Utrzymanie kontekstu uzytkownika przy dlugim scrollu i filtrowaniu.

## Zakres
- [ ] Sticky panel `Szukaj + Kategorie` na `Uslugi`
- [ ] Czytelny stan aktywnych filtrow (chipy lub mini-summary)
- [ ] Szybki reset filtrow jednym kliknieciem
- [ ] Ujednolicenie tego wzorca na `Klienci` i `Rezerwacje` (jezeli struktura widoku podobna)

## Pliki (minimum)
- `app/(dashboard)/[slug]/services/page.tsx`
- `app/(dashboard)/[slug]/clients/page.tsx`
- `app/(dashboard)/[slug]/bookings/page.tsx`

## Acceptance Criteria
- [ ] Uzytkownik zawsze widzi jak filtrowany jest widok
- [ ] Reset filtrow jest dostepny bez przewijania do gory
- [ ] Brak nakladania sticky paneli na tresc listy

## Weryfikacja
```bash
npx tsc --noEmit
```
Manual:
1. Przewin dluga liste -> panel filtrow pozostaje dostepny
2. Ustaw kilka filtrow -> reset usuwa wszystko poprawnie
