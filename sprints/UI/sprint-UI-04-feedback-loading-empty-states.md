# Sprint UI-04 - Feedback, Loading i Empty States

## Cel
Sprawic, by system zawsze jasno komunikowal: co sie dzieje, co sie udalo, co poszlo nie tak.

## Zakres
- [ ] Ujednolicenie loading states (skeleton dla list, spinner dla akcji punktowych)
- [ ] Ujednolicenie empty states (tekst + CTA + reset filtrow)
- [ ] Ujednolicenie toasts (success/error) i stylu komunikatow
- [ ] Dodanie "pending/disabled" stanow na przyciskach wykonujacych akcje sieciowe

## Pliki
- przekroj przez `app/(dashboard)/[slug]/**` i `components/**`

## Acceptance Criteria
- [ ] Kazdy widok listowy ma sensowny loading + empty state
- [ ] Przyciski akcji sieciowych maja stan pending
- [ ] Toasty sa zrozumiale i spójne jezykowo

## Weryfikacja
```bash
npx tsc --noEmit
```
Manual:
1. Wymus sytuacje "brak danych" i "blad API" na kluczowych ekranach
2. Potwierdz komunikaty i CTA
